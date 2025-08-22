// server/utils/emailTemplates.js

// --- tiny HTML escaper for user-provided strings (username, urls, etc.)
function escapeHTML(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const YEAR = String(new Date().getFullYear());

/**
 * Reset Password Email
 * @param {Object} params
 * @param {string} params.appName
 * @param {string} params.company
 * @param {string} params.logoUrl      absolute URL to your logo (e.g. https://yourdomain/logo.png)
 * @param {string} params.resetUrl     absolute reset link
 * @param {string} params.supportUrl   absolute support link
 * @param {string} [params.username]   optional username
 * @param {number} [params.expiryMinutes=10]
 * @returns {{subject:string, html:string, text:string}}
 */
exports.resetPasswordEmail = function resetPasswordEmail({
  appName,
  company,
  logoUrl,
  resetUrl,
  supportUrl,
  username,
  expiryMinutes = 10,
}) {
  const uName = username ? ` ${escapeHTML(username)},` : "";
  const safeApp = escapeHTML(appName || "");
  const safeCompany = escapeHTML(company || "");
  const safeLogo = escapeHTML(logoUrl || "");
  const safeReset = escapeHTML(resetUrl || "");
  const safeSupport = escapeHTML(supportUrl || "");
  const safeMinutes = String(expiryMinutes);

  const subject = `${safeApp}: Reset your password`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${subject}</title>
  <style>
    /* Base */
    body { margin:0; padding:0; background:#0b132a; }
    table { border-collapse:collapse; }
    img { border:0; line-height:100%; outline:none; text-decoration:none; display:block; }
    a { text-decoration:none; }

    .wrapper { width:100%; background:#0b132a; }
    .container { width:100%; max-width:600px; margin:0 auto; }
    .card {
      border-radius:16px;
      background:#0f1c3d;
      border:1px solid #1e2c57;
      box-shadow:0 14px 40px rgba(0,0,0,.35);
    }
    .p-32 { padding:32px }
    .px-32 { padding-left:32px; padding-right:32px }
    .py-24 { padding-top:24px; padding-bottom:24px }
    .center { text-align:center }

    /* Typography */
    .text { color:#eaf0ff; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .title { font-weight:800; font-size:24px; line-height:1.25; color:#ffffff; margin:0 }
    .subtitle { font-size:14px; color:#bcd0ff; margin:8px 0 0 0 }
    .muted { color:#9fb0d9 }
    .small { font-size:12px; line-height:1.6; }

    /* Button */
    .btn {
      display:inline-block;
      padding:14px 22px;
      border-radius:12px;
      font-weight:800;
      color:#fff !important;
      background: linear-gradient(90deg,#6a8aff,#3c65ff);
    }
    .btn:hover { filter: brightness(1.05); }

    /* Tag pill */
    .pill {
      display:inline-block; padding:6px 12px; border:1px solid #2a3b73;
      color:#bcd0ff; border-radius:999px; font-size:12px
    }

    /* Link styling */
    .link { color:#8fb0ff; }
    .hover-underline:hover { text-decoration:underline !important; }

    /* Light mode override */
    @media (prefers-color-scheme: light) {
      body { background:#f4f7ff; }
      .card { background:#ffffff; border-color:#e6ebff; }
      .text { color:#1a2141; }
      .muted { color:#586694; }
      .subtitle { color:#384a85; }
    }
  </style>
</head>
<body class="text">

  <!-- Inbox preview text -->
  <div style="display:none; overflow:hidden; line-height:1px; opacity:0; max-height:0; max-width:0;">
    Reset your ${safeApp} password. This link expires in ${safeMinutes} minutes.
  </div>

  <table role="presentation" class="wrapper" width="100%">
    <tr>
      <td class="py-24">
        <table role="presentation" class="container" width="100%">
          <!-- Logo -->
          <tr>
            <td class="center py-24">
              <img src="${safeLogo}" width="44" height="44" alt="${safeApp}" style="border-radius:8px; margin:0 auto; filter: drop-shadow(0 8px 22px rgba(106,138,255,.45));" />
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td class="card">
              <table role="presentation" width="100%">
                <tr><td class="p-32">
                  <h1 class="title">Reset your password</h1>
                  <p class="subtitle">Hi${uName} we received a request to reset your ${safeApp} password.</p>

                  <div class="py-24 center">
                    <a href="${safeReset}" class="btn">Create a new password</a>
                  </div>

                  <p class="small muted">
                    This link is valid for <strong>${safeMinutes} minutes</strong>. If you didn’t request this, you can safely ignore this email.
                  </p>

                  <hr style="border:none; height:1px; background:#1e2c57; margin:24px 0" />

                  <p class="small muted">
                    Having trouble with the button? Paste this URL into your browser:
                  </p>
                  <p class="small" style="word-break:break-all;">
                    <a href="${safeReset}" class="link hover-underline">${safeReset}</a>
                  </p>

                  <p class="small muted" style="margin-top:24px">
                    Need help? Visit <a class="link" href="${safeSupport}">Support</a> or reply to this email.
                  </p>
                </td></tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="center px-32 py-24">
              <span class="pill">${safeApp}</span>
              <p class="small muted" style="margin-top:10px">
                © ${YEAR} ${safeCompany}. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;

  const text = [
    `Reset your ${appName} password`,
    ``,
    `Hi${username ? ` ${username}` : ""}, we received a password reset request.`,
    `Click the link below (valid for ${safeMinutes} minutes):`,
    ``,
    resetUrl,
    ``,
    `If you didn’t request this, you can ignore this email.`,
    `Support: ${supportUrl}`,
    ``,
    `© ${YEAR} ${company}`,
  ].join("\n");

  return { subject, html, text };
};

/**
 * Password Changed Confirmation Email
 * @param {Object} params
 * @param {string} params.appName
 * @param {string} params.company
 * @param {string} params.logoUrl
 * @param {string} params.supportUrl
 * @param {string} [params.username]
 * @returns {{subject:string, html:string, text:string}}
 */
exports.passwordChangedEmail = function passwordChangedEmail({
  appName,
  company,
  logoUrl,
  supportUrl,
  username,
}) {
  const uName = username ? ` ${escapeHTML(username)},` : "";
  const safeApp = escapeHTML(appName || "");
  const safeCompany = escapeHTML(company || "");
  const safeLogo = escapeHTML(logoUrl || "");
  const safeSupport = escapeHTML(supportUrl || "");

  const subject = `${safeApp}: Password changed`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${subject}</title>
  <style>
    body { margin:0; padding:0; background:#0b132a; }
    table { border-collapse:collapse; }
    img { border:0; line-height:100%; outline:none; text-decoration:none; display:block; }
    a { text-decoration:none; }

    .wrapper { width:100%; background:#0b132a; }
    .container { width:100%; max-width:600px; margin:0 auto; }
    .card { border-radius:16px; background:#0f1c3d; border:1px solid #1e2c57; box-shadow:0 14px 40px rgba(0,0,0,.35); }
    .p-32 { padding:32px }
    .px-32 { padding-left:32px; padding-right:32px }
    .py-24 { padding-top:24px; padding-bottom:24px }
    .center { text-align:center }

    .text { color:#eaf0ff; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .title { font-weight:800; font-size:22px; margin:0 }
    .muted { color:#9fb0d9 }
    .small { font-size:12px; line-height:1.6; }
    .pill { display:inline-block; padding:6px 12px; border:1px solid #2a3b73; color:#bcd0ff; border-radius:999px; font-size:12px }
    .link { color:#8fb0ff; }

    @media (prefers-color-scheme: light) {
      body { background:#f4f7ff; }
      .card { background:#ffffff; border-color:#e6ebff; }
      .text { color:#1a2141; }
      .muted { color:#586694; }
    }
  </style>
</head>
<body class="text">

  <div style="display:none; overflow:hidden; line-height:1px; opacity:0; max-height:0; max-width:0;">
    Your ${safeApp} password was changed successfully.
  </div>

  <table role="presentation" class="wrapper" width="100%">
    <tr>
      <td class="py-24">
        <table role="presentation" class="container" width="100%">
          <tr>
            <td class="center py-24">
              <img src="${safeLogo}" width="44" height="44" alt="${safeApp}" style="border-radius:8px; margin:0 auto; filter: drop-shadow(0 8px 22px rgba(106,138,255,.45));" />
            </td>
          </tr>

          <tr>
            <td class="card">
              <table role="presentation" width="100%">
                <tr><td class="p-32">
                  <h1 class="title">Password changed</h1>
                  <p class="muted" style="margin-top:8px">Hi${uName} your ${safeApp} password was updated successfully.</p>

                  <p class="small muted" style="margin-top:18px">
                    If this wasn’t you, please <a class="link" href="${safeSupport}">contact support</a> immediately.
                  </p>

                  <hr style="border:none; height:1px; background:#1e2c57; margin:24px 0" />

                  <p class="small muted">For your security, we never send passwords over email.</p>
                </td></tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="center px-32 py-24">
              <span class="pill">${safeApp}</span>
              <p class="small muted" style="margin-top:10px">© ${YEAR} ${safeCompany}. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;

  const text = [
    `Your ${appName} password was changed.`,
    ``,
    `Hi${username ? ` ${username}` : ""}, your password was updated successfully.`,
    `If this wasn’t you, contact support immediately: ${supportUrl}`,
    ``,
    `© ${YEAR} ${company}`,
  ].join("\n");

  return { subject, html, text };
};
