import crypto from "crypto";

export type PasswordResetDeliveryChannel = "email" | "sms";
export type PasswordResetDeliveryStatus = "sent" | "skipped" | "failed";

export type PasswordResetDeliveryPayload = {
  email: string;
  phone?: string | null;
  token: string;
  expiresInMinutes: number;
  requestedIp?: string | null;
  userAgent?: string | null;
  preferredChannel?: string | null;
};

export type PasswordResetDeliveryResult = {
  channel: PasswordResetDeliveryChannel;
  provider: string;
  status: PasswordResetDeliveryStatus;
  destination?: string;
  message?: string;
  providerMessageId?: string;
};

export type PasswordResetDeliveryOptions = {
  fetchImpl?: typeof fetch;
  logger?: Pick<Console, "info" | "warn" | "error">;
};

type EmailTemplate = {
  subject: string;
  text: string;
  html: string;
};

type SmsTemplate = {
  body: string;
};

const DEFAULT_APP_NAME = "PowerGym Management";
const DEFAULT_RESET_PATH = "/login";
const DEFAULT_EMAIL_PROVIDER = "disabled";
const DEFAULT_SMS_PROVIDER = "disabled";

function envFirst(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

function csv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function safeTrim(value: unknown, maxLength: number) {
  return String(value || "").trim().slice(0, maxLength);
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizeBaseUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    url.search = "";
    return stripTrailingSlash(url.toString());
  } catch {
    return "";
  }
}

export function buildPasswordResetUrl(token: string) {
  const baseUrl = normalizeBaseUrl(
    envFirst("PASSWORD_RESET_PUBLIC_BASE_URL", "APP_PUBLIC_URL", "PUBLIC_APP_URL", "APP_ORIGIN", "PUBLIC_APP_ORIGIN", "VITE_APP_ORIGIN"),
  );
  const resetPath = envFirst("PASSWORD_RESET_PATH") || DEFAULT_RESET_PATH;
  const path = resetPath.startsWith("/") ? resetPath : `/${resetPath}`;

  if (!baseUrl) {
    return `/login?resetToken=${encodeURIComponent(token)}`;
  }

  const url = new URL(path, `${baseUrl}/`);
  url.searchParams.set("resetToken", token);
  return url.toString();
}

export function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const visibleLocal = local.length <= 2 ? local[0] || "*" : `${local[0]}***${local[local.length - 1]}`;
  return `${visibleLocal}@${domain}`;
}

export function maskPhone(phone?: string | null) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return undefined;
  return `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function getAppName() {
  return safeTrim(envFirst("APP_NAME", "VITE_APP_NAME") || DEFAULT_APP_NAME, 80);
}

function renderPasswordResetEmail(payload: PasswordResetDeliveryPayload, resetUrl: string): EmailTemplate {
  const appName = getAppName();
  const expires = payload.expiresInMinutes;
  const subject = `${appName} password reset`;
  const text = [
    `A password reset was requested for your ${appName} account.`,
    "",
    `Open this secure link within ${expires} minutes:`,
    resetUrl,
    "",
    "If you did not request this change, you can ignore this message. Your password will remain unchanged.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
  <body style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.5;">
    <h2 style="margin-bottom: 12px;">Reset your ${escapeHtml(appName)} password</h2>
    <p>A password reset was requested for your ${escapeHtml(appName)} account.</p>
    <p>This secure link expires in <strong>${expires} minutes</strong>.</p>
    <p>
      <a href="${escapeHtml(resetUrl)}" style="display: inline-block; background: #4f46e5; color: white; padding: 10px 16px; border-radius: 8px; text-decoration: none;">
        Reset password
      </a>
    </p>
    <p style="font-size: 13px; color: #64748b;">If the button does not work, copy and paste this URL into your browser:</p>
    <p style="font-size: 13px; word-break: break-all; color: #334155;">${escapeHtml(resetUrl)}</p>
    <p style="font-size: 13px; color: #64748b;">If you did not request this change, ignore this message. Your password will remain unchanged.</p>
  </body>
</html>`;

  return { subject, text, html };
}

function renderPasswordResetSms(payload: PasswordResetDeliveryPayload, resetUrl: string): SmsTemplate {
  return {
    body: `${getAppName()} password reset: ${resetUrl} Expires in ${payload.expiresInMinutes} minutes. Ignore if this was not you.`,
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getPreferredChannels(payload: PasswordResetDeliveryPayload): PasswordResetDeliveryChannel[] {
  const configured = csv(envFirst("PASSWORD_RESET_DELIVERY_CHANNELS"));
  const preferred = csv(String(payload.preferredChannel || ""));
  const channels = configured.length > 0 ? configured : preferred.length > 0 ? preferred : ["email"];
  const allowed = channels.filter((channel): channel is PasswordResetDeliveryChannel => channel === "email" || channel === "sms");
  return Array.from(new Set(allowed.length > 0 ? allowed : ["email"]));
}

function safeHeaderValue(value: string) {
  return value.replace(/[\r\n]/g, "").slice(0, 512);
}

function getWebhookHeaders(secret: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers.Authorization = `Bearer ${safeHeaderValue(secret)}`;
  return headers;
}

async function postJson(fetchImpl: typeof fetch, url: string, body: unknown, headers: Record<string, string>) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const responseText = await response.text().catch(() => "");
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}${responseText ? `: ${responseText.slice(0, 300)}` : ""}`);
  }

  if (!responseText) return null;
  try {
    return JSON.parse(responseText) as Record<string, unknown>;
  } catch {
    return { raw: responseText };
  }
}

async function deliverEmail(
  payload: PasswordResetDeliveryPayload,
  resetUrl: string,
  options: Required<PasswordResetDeliveryOptions>,
): Promise<PasswordResetDeliveryResult> {
  const provider = envFirst("PASSWORD_RESET_EMAIL_PROVIDER", "EMAIL_PROVIDER") || DEFAULT_EMAIL_PROVIDER;
  const template = renderPasswordResetEmail(payload, resetUrl);
  const destination = maskEmail(payload.email);

  if (provider === "disabled" || provider === "none") {
    return { channel: "email", provider, status: "skipped", destination, message: "Email provider is disabled." };
  }

  if (provider === "console" || provider === "log") {
    options.logger.info("Password reset email delivery", {
      to: payload.email,
      subject: template.subject,
      resetUrl,
      expiresInMinutes: payload.expiresInMinutes,
    });
    return { channel: "email", provider, status: "sent", destination, message: "Written to server log." };
  }

  if (provider === "webhook") {
    const webhookUrl = envFirst("PASSWORD_RESET_EMAIL_WEBHOOK_URL", "EMAIL_WEBHOOK_URL");
    if (!webhookUrl) {
      return { channel: "email", provider, status: "failed", destination, message: "PASSWORD_RESET_EMAIL_WEBHOOK_URL is not configured." };
    }
    const result = await postJson(
      options.fetchImpl,
      webhookUrl,
      {
        event: "password_reset.email",
        to: payload.email,
        subject: template.subject,
        text: template.text,
        html: template.html,
        resetUrl,
        expiresInMinutes: payload.expiresInMinutes,
      },
      getWebhookHeaders(envFirst("PASSWORD_RESET_EMAIL_WEBHOOK_SECRET", "EMAIL_WEBHOOK_SECRET")),
    );
    return {
      channel: "email",
      provider,
      status: "sent",
      destination,
      providerMessageId: safeTrim(result?.id || result?.messageId || result?.message_id, 128) || undefined,
    };
  }

  if (provider === "sendgrid") {
    const apiKey = envFirst("SENDGRID_API_KEY", "PASSWORD_RESET_SENDGRID_API_KEY");
    const fromEmail = envFirst("PASSWORD_RESET_EMAIL_FROM", "SENDGRID_FROM_EMAIL", "EMAIL_FROM");
    const fromName = envFirst("PASSWORD_RESET_EMAIL_FROM_NAME", "SENDGRID_FROM_NAME", "EMAIL_FROM_NAME") || getAppName();
    if (!apiKey || !fromEmail) {
      return { channel: "email", provider, status: "failed", destination, message: "SENDGRID_API_KEY and PASSWORD_RESET_EMAIL_FROM are required." };
    }

    await postJson(
      options.fetchImpl,
      "https://api.sendgrid.com/v3/mail/send",
      {
        personalizations: [{ to: [{ email: payload.email }] }],
        from: { email: fromEmail, name: fromName },
        subject: template.subject,
        content: [
          { type: "text/plain", value: template.text },
          { type: "text/html", value: template.html },
        ],
      },
      { Authorization: `Bearer ${safeHeaderValue(apiKey)}`, "Content-Type": "application/json" },
    );
    return { channel: "email", provider, status: "sent", destination };
  }

  return { channel: "email", provider, status: "failed", destination, message: `Unsupported email provider: ${provider}` };
}

async function deliverSms(
  payload: PasswordResetDeliveryPayload,
  resetUrl: string,
  options: Required<PasswordResetDeliveryOptions>,
): Promise<PasswordResetDeliveryResult> {
  const provider = envFirst("PASSWORD_RESET_SMS_PROVIDER", "SMS_PROVIDER") || DEFAULT_SMS_PROVIDER;
  const phone = safeTrim(payload.phone || "", 32);
  const destination = maskPhone(phone);

  if (!phone) {
    return { channel: "sms", provider, status: "skipped", destination, message: "No reset phone number is configured for this account." };
  }

  const template = renderPasswordResetSms(payload, resetUrl);

  if (provider === "disabled" || provider === "none") {
    return { channel: "sms", provider, status: "skipped", destination, message: "SMS provider is disabled." };
  }

  if (provider === "console" || provider === "log") {
    options.logger.info("Password reset SMS delivery", { to: phone, body: template.body });
    return { channel: "sms", provider, status: "sent", destination, message: "Written to server log." };
  }

  if (provider === "webhook") {
    const webhookUrl = envFirst("PASSWORD_RESET_SMS_WEBHOOK_URL", "SMS_WEBHOOK_URL");
    if (!webhookUrl) {
      return { channel: "sms", provider, status: "failed", destination, message: "PASSWORD_RESET_SMS_WEBHOOK_URL is not configured." };
    }
    const result = await postJson(
      options.fetchImpl,
      webhookUrl,
      {
        event: "password_reset.sms",
        to: phone,
        body: template.body,
        resetUrl,
        expiresInMinutes: payload.expiresInMinutes,
      },
      getWebhookHeaders(envFirst("PASSWORD_RESET_SMS_WEBHOOK_SECRET", "SMS_WEBHOOK_SECRET")),
    );
    return {
      channel: "sms",
      provider,
      status: "sent",
      destination,
      providerMessageId: safeTrim(result?.id || result?.messageId || result?.sid, 128) || undefined,
    };
  }

  if (provider === "twilio") {
    const accountSid = envFirst("TWILIO_ACCOUNT_SID", "PASSWORD_RESET_TWILIO_ACCOUNT_SID");
    const authToken = envFirst("TWILIO_AUTH_TOKEN", "PASSWORD_RESET_TWILIO_AUTH_TOKEN");
    const fromPhone = envFirst("PASSWORD_RESET_SMS_FROM", "TWILIO_FROM_PHONE", "SMS_FROM");
    if (!accountSid || !authToken || !fromPhone) {
      return { channel: "sms", provider, status: "failed", destination, message: "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and PASSWORD_RESET_SMS_FROM are required." };
    }

    const form = new URLSearchParams();
    form.set("To", phone);
    form.set("From", fromPhone);
    form.set("Body", template.body);

    const response = await options.fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    const responseText = await response.text().catch(() => "");
    if (!response.ok) throw new Error(`HTTP ${response.status}${responseText ? `: ${responseText.slice(0, 300)}` : ""}`);

    let providerMessageId: string | undefined;
    try {
      const json = JSON.parse(responseText) as { sid?: string };
      providerMessageId = safeTrim(json.sid, 128) || undefined;
    } catch {
      providerMessageId = undefined;
    }
    return { channel: "sms", provider, status: "sent", destination, providerMessageId };
  }

  return { channel: "sms", provider, status: "failed", destination, message: `Unsupported SMS provider: ${provider}` };
}

function sanitizeDeliveryError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[A-Za-z0-9_-]{24,}/g, "[redacted]").slice(0, 300);
}

export function getPasswordResetDeliveryPublicConfig() {
  return {
    channels: getPreferredChannels({ email: "", token: "", expiresInMinutes: 30 }),
    emailProvider: envFirst("PASSWORD_RESET_EMAIL_PROVIDER", "EMAIL_PROVIDER") || DEFAULT_EMAIL_PROVIDER,
    smsProvider: envFirst("PASSWORD_RESET_SMS_PROVIDER", "SMS_PROVIDER") || DEFAULT_SMS_PROVIDER,
    resetUrlMode: buildPasswordResetUrl("preview-token").startsWith("http") ? "absolute" : "relative",
  };
}

export async function sendPasswordResetDelivery(
  payload: PasswordResetDeliveryPayload,
  options: PasswordResetDeliveryOptions = {},
): Promise<PasswordResetDeliveryResult[]> {
  const resetUrl = buildPasswordResetUrl(payload.token);
  const resolvedOptions: Required<PasswordResetDeliveryOptions> = {
    fetchImpl: options.fetchImpl || fetch,
    logger: options.logger || console,
  };
  const channels = getPreferredChannels(payload);
  const results: PasswordResetDeliveryResult[] = [];

  for (const channel of channels) {
    try {
      const result = channel === "email"
        ? await deliverEmail(payload, resetUrl, resolvedOptions)
        : await deliverSms(payload, resetUrl, resolvedOptions);
      results.push(result);
    } catch (error) {
      results.push({
        channel,
        provider: channel === "email"
          ? envFirst("PASSWORD_RESET_EMAIL_PROVIDER", "EMAIL_PROVIDER") || DEFAULT_EMAIL_PROVIDER
          : envFirst("PASSWORD_RESET_SMS_PROVIDER", "SMS_PROVIDER") || DEFAULT_SMS_PROVIDER,
        status: "failed",
        destination: channel === "email" ? maskEmail(payload.email) : maskPhone(payload.phone),
        message: sanitizeDeliveryError(error),
      });
    }
  }

  return results;
}

export function hasSuccessfulPasswordResetDelivery(results: PasswordResetDeliveryResult[]) {
  return results.some((result) => result.status === "sent");
}

export function createDeliveryRequestId(email: string, tokenHash: string) {
  return crypto.createHash("sha256").update(`${email}:${tokenHash}`).digest("hex").slice(0, 24);
}
