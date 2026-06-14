function cleanString(value) {
  return value === undefined || value === null ? "" : String(value).trim();
}

function boolValue(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || String(value).toLowerCase() === "true";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function emailStatus(settings = {}) {
  const provider = cleanString(process.env.EMAIL_PROVIDER || settings.emailProvider || "resend").toLowerCase();
  const enabled = boolValue(process.env.EMAIL_ENABLED, settings.emailEnabled === true);
  const apiKeyPresent = Boolean(process.env.RESEND_API_KEY);
  const fromEmail = cleanString(process.env.RESEND_FROM_EMAIL || settings.emailFromEmail || "");
  const fromName = cleanString(process.env.RESEND_FROM_NAME || settings.emailFromName || settings.businessName || "DawnGas");
  const replyTo = cleanString(process.env.RESEND_REPLY_TO || settings.emailReplyTo || settings.email || "");
  const configured = enabled && provider === "resend" && apiKeyPresent && Boolean(fromEmail);

  return {
    provider,
    enabled,
    configured,
    apiKeyPresent,
    fromEmailPresent: Boolean(fromEmail),
    fromName,
    fromEmail,
    replyTo,
    message: configured
      ? "configured"
      : !enabled
        ? "Email service is disabled."
        : provider !== "resend"
          ? "Email provider is not supported."
          : !apiKeyPresent
            ? "RESEND_API_KEY is missing."
            : "RESEND_FROM_EMAIL is missing."
  };
}

function senderAddress(status) {
  return status.fromName ? `${status.fromName} <${status.fromEmail}>` : status.fromEmail;
}

async function sendEmail({ to, subject, html, text, settings = {}, attachments = [], idempotencyKey = "" }) {
  const status = emailStatus(settings);
  if (!status.configured) {
    const error = new Error("Email service is not configured.");
    error.code = "EMAIL_NOT_CONFIGURED";
    error.status = status;
    throw error;
  }

  const { Resend } = require("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  const payload = {
    from: senderAddress(status),
    to,
    subject,
    html,
    text,
    attachments
  };
  if (status.replyTo) payload.replyTo = status.replyTo;

  const options = idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : undefined;
  const { data, error } = await resend.emails.send(payload, options);
  if (error) {
    const sendError = new Error(error.message || "Email send failed.");
    sendError.providerError = error;
    throw sendError;
  }
  return { provider: "resend", providerMessageId: data?.id || "" };
}

function passwordResetTemplate({ resetUrl, ownerName, businessName }) {
  const safeBusiness = escapeHtml(businessName || "DawnGas");
  const safeName = escapeHtml(ownerName || "owner");
  const safeUrl = escapeHtml(resetUrl);
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#17202a">
      <h2 style="margin:0 0 12px">${safeBusiness} password reset</h2>
      <p>Hello ${safeName},</p>
      <p>Use the secure link below to set a new password for your DawnGas owner account. This link expires in 30 minutes.</p>
      <p><a href="${safeUrl}" style="display:inline-block;background:#13756D;color:#fff;padding:10px 16px;text-decoration:none;border-radius:6px">Reset password</a></p>
      <p>If the button does not work, paste this link into your browser:</p>
      <p style="word-break:break-all">${safeUrl}</p>
      <p>If you did not request this, you can ignore this email.</p>
    </div>
  `;
  const text = [
    `${businessName || "DawnGas"} password reset`,
    "",
    `Hello ${ownerName || "owner"},`,
    "Use this link to set a new password. It expires in 30 minutes:",
    resetUrl,
    "",
    "If you did not request this, you can ignore this email."
  ].join("\n");
  return { html, text };
}

async function sendPasswordResetEmail({ to, ownerName, businessName, resetUrl, settings }) {
  const template = passwordResetTemplate({ resetUrl, ownerName, businessName });
  return sendEmail({
    to,
    subject: `${businessName || "DawnGas"} password reset`,
    html: template.html,
    text: template.text,
    settings,
    idempotencyKey: `password-reset-${to}-${Date.now()}`
  });
}

async function sendTestEmail({ to, settings }) {
  return sendEmail({
    to,
    subject: `${settings.businessName || "DawnGas"} email test`,
    html: `<p>${escapeHtml(settings.businessName || "DawnGas")} transactional email is configured.</p>`,
    text: `${settings.businessName || "DawnGas"} transactional email is configured.`,
    settings,
    idempotencyKey: `email-test-${to}-${Date.now()}`
  });
}

module.exports = {
  emailStatus,
  sendEmail,
  sendPasswordResetEmail,
  sendTestEmail
};
