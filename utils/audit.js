import { Auditlog } from "../models/associations.js";

export async function writeAudit(req, action, entityType, entityId = null, details = {}) {
  try {
    await Auditlog.create({
      user_id: req.user?.id || null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
      ip_address: String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].slice(0, 64) || null,
    });
  } catch (error) {
    console.error("Audit log write failed:", error.message);
  }
}

export async function notifyUser(userId, title, message, link = null, transaction = undefined) {
  const { Notification } = await import("../models/Notification.js");
  return Notification.create({ user_id: userId, title, message, link }, { transaction });
}
