import {
  makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  type WASocket,
  type AuthenticationState,
  type SignalDataTypeMap,
  initAuthCreds,
  BufferJSON,
  proto,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { db } from "@workspace/db";
import { whatsappSessionsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import pino from "pino";
import { runAssistantForWhatsApp } from "./assistantInternal.js";

const logger = pino({ level: "info" }).child({ module: "whatsapp" });
const log = (...args: any[]) => console.log("[whatsapp]", ...args);

/* ── Per-user runtime state ──────────────────────────────────────── */
type UserState = {
  socket: WASocket | null;
  qrPng: string | null; /* data:image/png;base64,... */
  status: "disconnected" | "connecting" | "qr" | "connected" | "error";
  phone: string | null;
  displayName: string | null;
  lastError: string | null;
  busyJids: Set<string>; /* prevent overlapping replies per chat */
  busyMessages: Set<string>; /* dedup message processing */
  qrSubscribers: Set<(payload: object) => void>;
  connectInProgress: boolean; /* lock to prevent duplicate sockets */
  intentionalDisconnect: boolean; /* user-initiated disconnect — suppress auto-reconnect */
  generation: number; /* incremented on each connect — close handlers ignore stale events */
};

const STATE = new Map<number, UserState>();

function getState(uid: number): UserState {
  let s = STATE.get(uid);
  if (!s) {
    s = {
      socket: null, qrPng: null, status: "disconnected",
      phone: null, displayName: null, lastError: null,
      busyJids: new Set(), busyMessages: new Set(), qrSubscribers: new Set(),
      connectInProgress: false, intentionalDisconnect: false, generation: 0,
    };
    STATE.set(uid, s);
  }
  return s;
}

function pushQrUpdate(uid: number) {
  const s = getState(uid);
  const payload = {
    status: s.status,
    qr: s.qrPng,
    phone: s.phone,
    displayName: s.displayName,
    error: s.lastError,
  };
  for (const sub of s.qrSubscribers) {
    try { sub(payload); } catch { /* ignore */ }
  }
}

export function subscribeStatus(uid: number, cb: (payload: object) => void): () => void {
  const s = getState(uid);
  s.qrSubscribers.add(cb);
  cb({ status: s.status, qr: s.qrPng, phone: s.phone, displayName: s.displayName, error: s.lastError });
  return () => { s.qrSubscribers.delete(cb); };
}

export function getStatus(uid: number) {
  const s = getState(uid);
  return { status: s.status, phone: s.phone, displayName: s.displayName, error: s.lastError, qrPng: s.qrPng };
}

/* ── DB-backed auth state for Baileys ─────────────────────────────── */
async function loadAuthBlob(uid: number): Promise<any | null> {
  const [row] = await db.select({ authState: whatsappSessionsTable.authState })
    .from(whatsappSessionsTable).where(eq(whatsappSessionsTable.userId, uid)).limit(1);
  if (!row?.authState) return null;
  try { return JSON.parse(JSON.stringify(row.authState), BufferJSON.reviver); }
  catch { return null; }
}

async function saveAuthBlob(uid: number, blob: any) {
  const serialized = JSON.parse(JSON.stringify(blob, BufferJSON.replacer));
  await db.execute(sql`
    INSERT INTO whatsapp_sessions (user_id, auth_state, updated_at)
    VALUES (${uid}, ${JSON.stringify(serialized)}::jsonb, now())
    ON CONFLICT (user_id) DO UPDATE SET auth_state = EXCLUDED.auth_state, updated_at = now()
  `);
}

async function makeDbAuthState(uid: number): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const blob = (await loadAuthBlob(uid)) ?? { creds: initAuthCreds(), keys: {} as Record<string, Record<string, any>> };
  if (!blob.creds) blob.creds = initAuthCreds();
  if (!blob.keys) blob.keys = {};

  const state: AuthenticationState = {
    creds: blob.creds,
    keys: {
      get: async (type, ids) => {
        const data: Record<string, SignalDataTypeMap[typeof type]> = {} as any;
        const bucket = blob.keys[type] || {};
        for (const id of ids) {
          let val = bucket[id];
          if (val) {
            if (type === "app-state-sync-key" && val) val = proto.Message.AppStateSyncKeyData.fromObject(val);
            data[id] = val;
          }
        }
        return data;
      },
      set: async (data) => {
        for (const category of Object.keys(data)) {
          blob.keys[category] = blob.keys[category] || {};
          const items = (data as any)[category];
          for (const id of Object.keys(items)) {
            const v = items[id];
            if (v == null) delete blob.keys[category][id];
            else blob.keys[category][id] = v;
          }
        }
        await saveAuthBlob(uid, blob);
      },
    },
  };

  return { state, saveCreds: async () => { await saveAuthBlob(uid, blob); } };
}

/* ── Status persistence (upsert) ──────────────────────────────────── */
async function persistStatus(uid: number, fields: Partial<{
  status: string; phoneNumber: string | null; displayName: string | null;
  connectedAt: Date | null; lastQr: string | null;
}>) {
  const set: any = { updatedAt: new Date() };
  if (fields.status !== undefined)      set.status        = fields.status;
  if (fields.phoneNumber !== undefined) set.phoneNumber   = fields.phoneNumber;
  if (fields.displayName !== undefined) set.displayName   = fields.displayName;
  if (fields.connectedAt !== undefined) set.connectedAt   = fields.connectedAt;
  if (fields.lastQr !== undefined)      set.lastQr        = fields.lastQr;
  /* Ensure a row exists, then update */
  await db.insert(whatsappSessionsTable).values({ userId: uid, ...set }).onConflictDoUpdate({
    target: whatsappSessionsTable.userId,
    set,
  });
}

/* ── Connection lifecycle ─────────────────────────────────────────── */
export async function connect(uid: number): Promise<void> {
  const s = getState(uid);
  /* Lock — prevent duplicate sockets if connect() is invoked twice rapidly */
  if (s.connectInProgress) return;
  if (s.socket && (s.status === "connecting" || s.status === "connected" || s.status === "qr")) {
    return; /* already running */
  }
  s.connectInProgress = true;
  s.intentionalDisconnect = false;
  const myGen = ++s.generation;

  s.status = "connecting";
  s.lastError = null;
  s.qrPng = null;
  pushQrUpdate(uid);
  await persistStatus(uid, { status: "connecting", lastQr: null });
  log(`uid=${uid} starting Baileys connect (gen=${myGen})`);

  try {
    const { state, saveCreds } = await makeDbAuthState(uid);
    const QRCode = (await import("qrcode")).default;
    /* Always fetch the current WhatsApp Web protocol version so the server
       does not reject our connection with version-mismatch (silent hang). */
    let version: [number, number, number] | undefined;
    try {
      const v = await fetchLatestBaileysVersion();
      version = v.version;
      log(`uid=${uid} using WA version`, version, "isLatest=", v.isLatest);
    } catch (e) {
      log(`uid=${uid} fetchLatestBaileysVersion failed, using default:`, (e as Error)?.message);
    }

    const sock = makeWASocket({
      version,
      auth: state,
      logger: logger as any,
      printQRInTerminal: false,
      browser: ["Advantix Assistant", "Chrome", "1.0.0"],
      syncFullHistory: false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 30_000,
      qrTimeout: 60_000,
    });
    log(`uid=${uid} socket created, waiting for events…`);

    s.socket = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      /* Ignore events from a previous (superseded) socket generation */
      if (myGen !== s.generation) return;
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        log(`uid=${uid} QR received (len=${qr.length})`);
        try {
          s.qrPng = await QRCode.toDataURL(qr, { width: 320, margin: 1 });
          s.status = "qr";
          await persistStatus(uid, { status: "qr", lastQr: qr });
          pushQrUpdate(uid);
        } catch (e) { log(`uid=${uid} qr render failed:`, (e as Error)?.message); }
      }

      if (connection === "connecting") {
        log(`uid=${uid} ws connecting…`);
      }

      if (connection === "open") {
        log(`uid=${uid} CONNECTED as`, sock.user?.id);
        s.status = "connected";
        s.qrPng = null;
        const me = sock.user;
        if (me) {
          s.phone = me.id.split(":")[0].split("@")[0];
          s.displayName = me.name || me.verifiedName || null;
        }
        await persistStatus(uid, {
          status: "connected", phoneNumber: s.phone, displayName: s.displayName,
          connectedAt: new Date(), lastQr: null,
        });
        pushQrUpdate(uid);
      }

      if (connection === "close") {
        const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const loggedOut = reason === DisconnectReason.loggedOut;
        log(`uid=${uid} CLOSED reason=${reason} err=${lastDisconnect?.error?.message ?? "n/a"} intentional=${s.intentionalDisconnect}`);
        s.socket = null;
        if (loggedOut) {
          s.status = "disconnected";
          s.phone = null;
          s.displayName = null;
          s.lastError = "Logged out from phone";
          await db.update(whatsappSessionsTable)
            .set({ status: "disconnected", phoneNumber: null, displayName: null, authState: null, lastQr: null, updatedAt: new Date() })
            .where(eq(whatsappSessionsTable.userId, uid));
          pushQrUpdate(uid);
        } else if (s.intentionalDisconnect) {
          /* User-initiated — do not auto-reconnect */
          s.status = "disconnected";
          s.lastError = null;
          await persistStatus(uid, { status: "disconnected", lastQr: null });
          pushQrUpdate(uid);
        } else {
          /* Network drop / unexpected — auto-reconnect after a small delay */
          s.status = "connecting";
          s.lastError = String(lastDisconnect?.error?.message ?? "connection closed");
          pushQrUpdate(uid);
          setTimeout(() => {
            if (!s.intentionalDisconnect) connect(uid).catch(() => {});
          }, 3000);
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      if (myGen !== s.generation) return;
      for (const msg of messages) {
        try { await handleIncomingMessage(uid, sock, msg); }
        catch (e) { logger.error({ err: e }, "message handler error"); }
      }
    });

  } catch (err) {
    log(`uid=${uid} connect() THREW:`, (err as Error)?.message, (err as Error)?.stack);
    s.status = "error";
    s.lastError = String((err as Error)?.message ?? err);
    s.socket = null;
    await persistStatus(uid, { status: "error" });
    pushQrUpdate(uid);
  } finally {
    s.connectInProgress = false;
  }
}

export async function disconnect(uid: number, fullLogout = false): Promise<void> {
  const s = getState(uid);
  s.intentionalDisconnect = true;
  s.generation++; /* invalidate any pending close handlers from the old socket */
  try {
    if (s.socket) {
      if (fullLogout) await s.socket.logout().catch(() => {});
      else s.socket.end(undefined);
    }
  } catch { /* ignore */ }
  s.socket = null;
  s.qrPng = null;
  s.status = "disconnected";
  s.phone = null;
  s.displayName = null;
  if (fullLogout) {
    await db.update(whatsappSessionsTable)
      .set({ status: "disconnected", phoneNumber: null, displayName: null, authState: null, lastQr: null, updatedAt: new Date() })
      .where(eq(whatsappSessionsTable.userId, uid));
  } else {
    await persistStatus(uid, { status: "disconnected", lastQr: null });
  }
  pushQrUpdate(uid);
}

/* ── Incoming message handling ────────────────────────────────────── */
async function handleIncomingMessage(uid: number, sock: WASocket, msg: proto.IWebMessageInfo) {
  if (!msg.message || msg.key.fromMe) return;
  const jid = msg.key.remoteJid;
  if (!jid) return;
  if (jid === "status@broadcast") return;

  const msgId = `${jid}:${msg.key.id}`;
  const s = getState(uid);
  if (s.busyMessages.has(msgId)) return;
  s.busyMessages.add(msgId);
  setTimeout(() => s.busyMessages.delete(msgId), 60_000);

  /* Extract plain text */
  const m = msg.message;
  const text =
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    "";
  if (!text.trim()) return;

  /* Load settings */
  const [settings] = await db.select().from(whatsappSessionsTable).where(eq(whatsappSessionsTable.userId, uid)).limit(1);
  if (!settings) return;

  const isGroup = jid.endsWith("@g.us");
  const allowed = (settings.allowedJids || []) as string[];
  const blocked = (settings.blockedJids || []) as string[];

  if (blocked.includes(jid)) return;
  if (allowed.length > 0 && !allowed.includes(jid)) return;

  const trigger = (settings.triggerWord || "@bot").toLowerCase();
  let cleanedText = text.trim();
  let shouldReply = false;

  if (isGroup) {
    if (!settings.autoReplyGroups && allowed.length === 0) return;
    /* In groups: require trigger word OR mention */
    if (cleanedText.toLowerCase().startsWith(trigger)) {
      cleanedText = cleanedText.slice(trigger.length).trim();
      shouldReply = true;
    } else if (settings.autoReplyGroups && allowed.includes(jid)) {
      shouldReply = true; /* group is explicitly allowed */
    }
  } else {
    /* DM */
    if (settings.autoReplyDm) shouldReply = true;
    if (cleanedText.toLowerCase().startsWith(trigger)) {
      cleanedText = cleanedText.slice(trigger.length).trim();
      shouldReply = true;
    }
  }

  if (!shouldReply || !cleanedText) return;

  /* Per-chat queue: don't process two messages at the same time in same chat */
  if (s.busyJids.has(jid)) {
    await sock.sendMessage(jid, { text: "⏳ এক মিনিট, আগের message এর reply দিচ্ছি…" }).catch(() => {});
    return;
  }
  s.busyJids.add(jid);

  try {
    /* Show typing */
    await sock.sendPresenceUpdate("composing", jid).catch(() => {});

    const reply = await runAssistantForWhatsApp(uid, cleanedText);

    await sock.sendPresenceUpdate("paused", jid).catch(() => {});
    await sock.sendMessage(jid, { text: reply || "(no reply)" }, { quoted: msg });
  } catch (err) {
    await sock.sendMessage(jid, { text: `⚠️ Error: ${String((err as Error)?.message ?? err)}` }, { quoted: msg }).catch(() => {});
  } finally {
    s.busyJids.delete(jid);
  }
}

/* ── Auto-resume on server start ──────────────────────────────────── */
export async function resumeAllSessions() {
  try {
    const rows = await db.select({ userId: whatsappSessionsTable.userId, status: whatsappSessionsTable.status, authState: whatsappSessionsTable.authState })
      .from(whatsappSessionsTable);
    for (const row of rows) {
      if (row.authState && (row.status === "connected" || row.status === "connecting" || row.status === "qr")) {
        connect(row.userId).catch(e => logger.error({ err: e, uid: row.userId }, "resume failed"));
      }
    }
  } catch (e) { logger.error({ err: e }, "resumeAllSessions failed"); }
}
