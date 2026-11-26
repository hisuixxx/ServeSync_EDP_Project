import nodemailer from "nodemailer";

const mailFrom = () => ({
  name: process.env.MAIL_FROM_NAME || "ServeSync Restaurant",
  address: process.env.MAIL_FROM_ADDRESS || process.env.MAIL_USERNAME || "",
});

export async function sendTransactionalEmail({ to, subject, text, html, event }) {
  let transporter;
  try {
    const host = process.env.MAIL_HOST || "";
    const username = process.env.MAIL_USERNAME || "";
    const password = process.env.MAIL_PASSWORD || "";
    const port = Number(process.env.MAIL_PORT || 587);
    const from = mailFrom();
    if ((process.env.MAIL_MAILER && process.env.MAIL_MAILER !== "smtp") || !host || !username || !password || !from.address || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("SMTP mail configuration is incomplete.");
    }

    transporter = nodemailer.createTransport({
      host,
      port,
      secure: (process.env.MAIL_ENCRYPTION || "tls").toLowerCase() === "ssl" || port === 465,
      requireTLS: (process.env.MAIL_ENCRYPTION || "tls").toLowerCase() === "tls" && port !== 465,
      auth: { user: username, pass: password },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });

    await transporter.sendMail({ from, to, subject, text, ...(html ? { html } : {}) });
    console.info(`Email sent: ${event}`);
    return true;
  } catch (error) {
    console.error(`Email delivery failed (${event}):`, error.message);
    return false;
  } finally {
    transporter?.close();
  }
}
