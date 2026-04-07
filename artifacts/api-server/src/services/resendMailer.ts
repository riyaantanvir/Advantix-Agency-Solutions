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

export interface SendEmailParams {
  to: string;
  from: string;
  subject: string;
  html: string;
  replyTo?: string;
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

  try {
    const { data, error } = await resend.emails.send({
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo,
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
    try {
      const { error } = await resend.emails.send({
        from: email.from,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        replyTo: email.replyTo,
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
