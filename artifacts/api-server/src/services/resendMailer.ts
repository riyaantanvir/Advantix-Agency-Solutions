import { Resend } from "resend";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { integrationsTable } from "@workspace/db/schema";

async function getResendApiKey(): Promise<string | null> {
  const [row] = await db
    .select()
    .from(integrationsTable)
    .where(eq(integrationsTable.name, "RESEND_API_KEY"));
  return row?.value || null;
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&bull;/g, "•")
    .replace(/&rarr;/g, "→")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface SendEmailParams {
  to: string;
  from: string;
  subject: string;
  html: string;
  replyTo?: string;
  listUnsubscribe?: string;
}

export interface SendEmailResult {
  success: boolean;
  resendId?: string;
  error?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY || (await getResendApiKey());
  if (!apiKey) {
    return { success: false, error: "Resend API key not configured. Add it in Admin → System → Integrations." };
  }

  const resend = new Resend(apiKey);
  const textContent = stripHtmlToText(params.html);

  const headers: Record<string, string> = {};
  if (params.listUnsubscribe) {
    headers["List-Unsubscribe"] = `<${params.listUnsubscribe}>`;
    if (params.listUnsubscribe.startsWith("https://")) {
      headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
    }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: textContent,
      replyTo: params.replyTo || extractEmailFromAddress(params.from),
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, resendId: data?.id };
  } catch (err: any) {
    return { success: false, error: err?.message ?? "Unknown Resend error" };
  }
}

export async function sendBulkEmails(
  emails: SendEmailParams[]
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const apiKey = process.env.RESEND_API_KEY || (await getResendApiKey());
  if (!apiKey) {
    return { sent: 0, failed: emails.length, errors: ["Resend API key not configured"] };
  }

  const resend = new Resend(apiKey);
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const email of emails) {
    const textContent = stripHtmlToText(email.html);
    const headers: Record<string, string> = {};
    if (email.listUnsubscribe) {
      headers["List-Unsubscribe"] = `<${email.listUnsubscribe}>`;
      if (email.listUnsubscribe.startsWith("https://")) {
        headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
      }
    }

    try {
      const { error } = await resend.emails.send({
        from: email.from,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: textContent,
        replyTo: email.replyTo || extractEmailFromAddress(email.from),
        headers: Object.keys(headers).length > 0 ? headers : undefined,
      });
      if (error) {
        failed++;
        errors.push(`${email.to}: ${error.message}`);
      } else {
        sent++;
      }
    } catch (err: any) {
      failed++;
      errors.push(`${email.to}: ${err?.message ?? "Unknown error"}`);
    }
  }

  return { sent, failed, errors };
}

function extractEmailFromAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}
