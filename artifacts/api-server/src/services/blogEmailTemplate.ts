export interface BlogEmailOptions {
  subscriberName?: string | null;
  blogTitle: string;
  blogExcerpt?: string | null;
  blogUrl: string;
  coverImageUrl?: string | null;
  author: string;
  category: string;
  readingTime?: string | null;
  unsubscribeUrl: string;
}

export function buildBlogNotificationEmail(opts: BlogEmailOptions): string {
  const {
    subscriberName,
    blogTitle,
    blogExcerpt,
    blogUrl,
    coverImageUrl,
    author,
    category,
    readingTime,
    unsubscribeUrl,
  } = opts;

  const greeting = subscriberName ? `Hi ${subscriberName},` : "Hey there,";
  const excerpt = blogExcerpt ?? "We have published a new article for you. Click below to read it.";
  const coverBlock = coverImageUrl
    ? `<img src="${coverImageUrl}" alt="${blogTitle}" style="width:100%;height:220px;object-fit:cover;display:block;border-radius:12px 12px 0 0;" />`
    : `<div style="width:100%;height:8px;background:linear-gradient(90deg,#6366f1,#8b5cf6,#a855f7);border-radius:12px 12px 0 0;"></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${blogTitle}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:600px;" cellpadding="0" cellspacing="0">

          <!-- Header Logo -->
          <tr>
            <td style="padding:0 0 24px 0;" align="center">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:12px;padding:2px;">
                    <div style="background:#0a0a0f;border-radius:10px;padding:8px 20px;">
                      <span style="font-size:20px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;">Advantix</span>
                      <span style="font-size:20px;font-weight:800;letter-spacing:-0.5px;color:#8b5cf6;">.</span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Card -->
          <tr>
            <td style="background:#111118;border-radius:16px;overflow:hidden;border:1px solid #1e1e2e;">
              <!-- Cover Image or gradient bar -->
              <div>${coverBlock}</div>

              <!-- Tag row -->
              <div style="padding:24px 32px 0 32px;">
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="background:#6366f1;border-radius:6px;padding:4px 12px;">
                      <span style="font-size:11px;font-weight:700;color:#ffffff;letter-spacing:0.5px;text-transform:uppercase;">${category}</span>
                    </td>
                    ${readingTime ? `<td style="padding-left:10px;"><span style="font-size:12px;color:#6b7280;">⏱ ${readingTime}</span></td>` : ""}
                  </tr>
                </table>
              </div>

              <!-- Content -->
              <div style="padding:20px 32px 32px 32px;">
                <p style="margin:0 0 8px 0;font-size:14px;color:#8b5cf6;font-weight:600;">NEW POST</p>
                <h1 style="margin:0 0 16px 0;font-size:26px;font-weight:800;color:#f1f5f9;line-height:1.3;">${blogTitle}</h1>
                <p style="margin:0 0 20px 0;font-size:15px;color:#94a3b8;line-height:1.7;">${greeting}</p>
                <p style="margin:0 0 28px 0;font-size:15px;color:#94a3b8;line-height:1.7;">${excerpt}</p>

                <!-- CTA Button -->
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);">
                      <a href="${blogUrl}" target="_blank" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.2px;">
                        Read the Article →
                      </a>
                    </td>
                  </tr>
                </table>

                <!-- Author row -->
                <table cellpadding="0" cellspacing="0" style="margin-top:32px;padding-top:24px;border-top:1px solid #1e1e2e;width:100%;">
                  <tr>
                    <td>
                      <div style="display:inline-block;width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#a855f7);text-align:center;line-height:36px;font-size:16px;color:#fff;font-weight:700;vertical-align:middle;">
                        ${author.charAt(0).toUpperCase()}
                      </div>
                    </td>
                    <td style="padding-left:12px;vertical-align:middle;">
                      <p style="margin:0;font-size:13px;font-weight:600;color:#e2e8f0;">${author}</p>
                      <p style="margin:0;font-size:12px;color:#6b7280;">Advantix Digital Team</p>
                    </td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>

          <!-- Divider features -->
          <tr>
            <td style="padding:24px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="33%" align="center" style="padding:0 8px;">
                    <div style="background:#111118;border:1px solid #1e1e2e;border-radius:12px;padding:16px 12px;text-align:center;">
                      <div style="font-size:22px;margin-bottom:8px;">✍️</div>
                      <p style="margin:0;font-size:12px;font-weight:600;color:#e2e8f0;">Expert Insights</p>
                      <p style="margin:0;font-size:11px;color:#6b7280;margin-top:4px;">Hand-picked content</p>
                    </div>
                  </td>
                  <td width="33%" align="center" style="padding:0 8px;">
                    <div style="background:#111118;border:1px solid #1e1e2e;border-radius:12px;padding:16px 12px;text-align:center;">
                      <div style="font-size:22px;margin-bottom:8px;">🚀</div>
                      <p style="margin:0;font-size:12px;font-weight:600;color:#e2e8f0;">Growth Tips</p>
                      <p style="margin:0;font-size:11px;color:#6b7280;margin-top:4px;">Actionable strategies</p>
                    </div>
                  </td>
                  <td width="33%" align="center" style="padding:0 8px;">
                    <div style="background:#111118;border:1px solid #1e1e2e;border-radius:12px;padding:16px 12px;text-align:center;">
                      <div style="font-size:22px;margin-bottom:8px;">💡</div>
                      <p style="margin:0;font-size:12px;font-weight:600;color:#e2e8f0;">Weekly Digest</p>
                      <p style="margin:0;font-size:11px;color:#6b7280;margin-top:4px;">Stay ahead always</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:0 0 16px 0;">
              <p style="margin:0 0 8px 0;font-size:12px;color:#374151;">
                You're receiving this because you subscribed to Advantix Blog updates.
              </p>
              <p style="margin:0;font-size:12px;color:#374151;">
                <a href="${unsubscribeUrl}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
                &nbsp;·&nbsp;
                <a href="https://advantixdigital.com" style="color:#6b7280;text-decoration:none;">advantixdigital.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
