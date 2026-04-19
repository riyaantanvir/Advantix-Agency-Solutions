import type { Request, Response, NextFunction } from "express";

const ADMIN_TOOL_USER_ID = 1;
const ADMIN_TOOL_USER_NAME = "Admin";
const ADMIN_TOOL_USER_EMAIL = "admin@advantix.digital";

export { ADMIN_TOOL_USER_ID, ADMIN_TOOL_USER_NAME, ADMIN_TOOL_USER_EMAIL };

/* Internal token used by server-side callers (e.g. WhatsApp handler)
   to invoke user-scoped endpoints on behalf of a user, without needing
   a session cookie. Generated on first import and only valid in-process. */
import { randomBytes } from "crypto";
export const INTERNAL_API_TOKEN = randomBytes(32).toString("hex");

export function requireToolUser(req: Request, res: Response, next: NextFunction): void {
  /* In-process bypass for trusted internal callers */
  const internalTok = req.headers["x-internal-token"];
  const internalUidRaw = req.headers["x-internal-user-id"];
  if (typeof internalTok === "string" && internalTok === INTERNAL_API_TOKEN && typeof internalUidRaw === "string") {
    /* Loopback-only: this token is in-process generated, but defence-in-depth
       — if somehow exposed via a misconfigured proxy, refuse non-loopback IPs. */
    const ip = req.ip || req.socket?.remoteAddress || "";
    const isLoopback = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
    if (!isLoopback) {
      res.status(401).json({ error: "Internal token from non-loopback origin" });
      return;
    }
    const uid = parseInt(internalUidRaw, 10);
    if (Number.isFinite(uid) && uid > 0) {
      /* Request-scoped only — do NOT mutate req.session (avoids creating a
         persistent session row per internal call). Downstream userId() helpers
         consult req.internalToolUserId first. */
      (req as any).internalToolUserId = uid;
      next();
      return;
    }
  }

  const session = req.session as { toolUserId?: number; adminId?: number; username?: string };
  if (session.toolUserId) {
    next();
    return;
  }
  if (session.adminId) {
    req.session.toolUserId = ADMIN_TOOL_USER_ID;
    req.session.toolUserName = ADMIN_TOOL_USER_NAME;
    req.session.toolUserEmail = ADMIN_TOOL_USER_EMAIL;
    next();
    return;
  }
  res.status(401).json({ error: "Not authenticated" });
}
