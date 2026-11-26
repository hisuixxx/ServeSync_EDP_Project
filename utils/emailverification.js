import { createHash, randomBytes } from "node:crypto";
import { sequelize } from "../models/db.js";
import { User } from "../models/userModel.js";
import { sendTransactionalEmail } from "./mailer.js";

const COOLDOWN_MS = 60 * 1000;
const hashToken = token => createHash("sha256").update(token).digest("hex");
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[character]);

function verificationBaseUrl() {
  const isProduction = process.env.NODE_ENV === "production";
  const configuredUrl = process.env.APP_URL?.trim();
  if (!configuredUrl && isProduction) {
    console.error("Email verification link unavailable: APP_URL must be configured for production.");
    return null;
  }

  try {
    const url = new URL(configuredUrl || `http://localhost:${process.env.PORT || 3000}`);
    const localHost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (!["http:", "https:"].includes(url.protocol) || (isProduction && (url.protocol !== "https:" || localHost))) {
      console.error("Email verification link unavailable: APP_URL must be a public HTTPS URL in production.");
      return null;
    }
    return url.origin;
  } catch (error) {
    console.error("Email verification link unavailable: APP_URL is invalid.", error.message);
    return null;
  }
}

export async function issueVerificationEmail(user) {
  const baseUrl = verificationBaseUrl();
  if (!baseUrl) return { sent: false, reason: "invalid_app_url" };

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const sentAt = new Date();
  let recipient;
  const transaction = await sequelize.transaction();
  try {
    const lockedUser = await User.findByPk(user.id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!lockedUser) throw new Error("User no longer exists.");
    if (lockedUser.email_verified_at) {
      await transaction.rollback();
      return { sent: false, reason: "already_verified" };
    }

    const previousSentAt = lockedUser.email_verification_sent_at
      ? new Date(lockedUser.email_verification_sent_at).getTime()
      : NaN;
    const remainingMs = previousSentAt + COOLDOWN_MS - Date.now();
    if (Number.isFinite(previousSentAt) && remainingMs > 0) {
      await transaction.rollback();
      return {
        sent: false,
        reason: "cooldown",
        cooldownSeconds: Math.ceil(remainingMs / 1000),
      };
    }

    await lockedUser.update({
      email_verification_token_hash: hashToken(token),
      email_verification_expires_at: expiresAt,
      email_verification_sent_at: sentAt,
    }, { transaction });
    recipient = { email: lockedUser.email, fullName: lockedUser.full_name };
    await transaction.commit();
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  }

  const link = new URL(`/email/verify/${token}`, baseUrl).toString();
  const safeName = escapeHtml(recipient.fullName || "there");
  const safeLink = escapeHtml(link);
  const sent = await sendTransactionalEmail({
    to: recipient.email,
    subject: "Verify your ServeSync email address",
    text: `Hello ${recipient.fullName || "there"},\n\nYour ServeSync account was created. Verify your email address to continue to checkout: ${link}\n\nThis link expires in 24 hours. If you did not create this account, you can ignore this message.`,
    html: `<!doctype html><html lang="en"><body style="margin:0;background:#f2f6f5;font-family:Arial,sans-serif;color:#142238"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="padding:28px 32px;background:#102a29;color:#fff"><div style="font-size:13px;font-weight:bold;letter-spacing:2px;color:#67e1bd">SERVESYNC</div><h1 style="margin:12px 0 0;font-size:25px">Verify your email address</h1></td></tr><tr><td style="padding:30px 32px;line-height:1.6"><p>Hello ${safeName},</p><p>Your ServeSync account was created. Confirm this email address to continue to checkout.</p><p style="margin:26px 0"><a href="${safeLink}" style="display:inline-block;padding:13px 22px;border-radius:9px;background:#169876;color:#fff;text-decoration:none;font-weight:bold">Verify email address</a></p><p style="font-size:14px;color:#526174">This secure link expires in 24 hours. If you did not create this account, you can ignore this message.</p></td></tr></table></td></tr></table></body></html>`,
    event: "email_verification",
  });
  if (!sent) {
    const cooldownSeconds = Math.max(1, Math.ceil((sentAt.getTime() + COOLDOWN_MS - Date.now()) / 1000));
    return { sent: false, reason: "delivery_failed", cooldownSeconds };
  }
  return { sent: true };
}

export function verificationTokenHash(token) {
  return hashToken(token);
}
