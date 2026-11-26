import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { sequelize } from "../models/db.js";
import { Cart, CartItem, Product, Order, OrderItem, Payment, Notification, User, Auditlog } from "../models/associations.js";
import { getStorefrontSettings } from "../models/StorefrontSetting.js";
import { sendTransactionalEmail } from "../utils/mailer.js";
import { getConfiguredGcashQr } from "../utils/gcash.js";

const safeText = (value, max = 500) => String(value ?? "").trim().slice(0, max);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[character]);
const formatPeso = value => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value));
const validContactNumber = value => {
  const digits = value.replace(/\D/g, "");
  return /^[0-9+() .-]{7,30}$/.test(value) && digits.length >= 7 && digits.length <= 15;
};
const redirectToCheckout = res => res.redirect("/cart?checkout=1");
const rejectCheckout = async (req, res, message) => {
  if (req.file?.filename) {
    try {
      await unlink(path.resolve("storage/payment-receipts", req.file.filename));
    } catch (error) {
      if (error.code !== "ENOENT") console.error("Remove rejected payment receipt:", error.message);
    }
  }
  req.flash("error_msg", message);
  return redirectToCheckout(res);
};

export const checkoutPage = (_req, res) => redirectToCheckout(res);

export const placeCheckoutOrder = async (req, res) => {
  const paymentMethod = String(req.body.payment_method || "");
  const rawReference = String(req.body.reference_code ?? "").trim();
  const reference = rawReference.replace(/\s+/g, "");
  const orderType = String(req.body.order_type || "");
  const address = String(req.body.delivery_address ?? "").trim();
  const phone = String(req.body.contact_number ?? "").trim();
  const notes = String(req.body.notes ?? "").trim();
  const acceptedTerms = ["on", "true", "1"].includes(String(req.body.acceptTerms || "").toLowerCase());

  if (!req.user?.email_verified_at) {
    return rejectCheckout(req, res, "Verify your registered email address before placing an order.");
  }
  if (!["gcash", "cash_on_delivery"].includes(paymentMethod)) {
    return rejectCheckout(req, res, "Choose a valid payment method.");
  }
  if (!["pickup", "delivery"].includes(orderType)) {
    return rejectCheckout(req, res, "Choose pickup or delivery.");
  }
  if (phone.length > 30 || !validContactNumber(phone)) {
    return rejectCheckout(req, res, "Enter a valid contact number.");
  }
  if (orderType === "delivery" && (address.length < 8 || address.length > 500)) {
    return rejectCheckout(req, res, "Please enter a complete delivery address.");
  }
  if (paymentMethod === "gcash" && (rawReference.length > 100 || !/^[A-Za-z0-9-]{6,100}$/.test(reference))) {
    return rejectCheckout(req, res, "Enter a valid GCash reference number (6–100 letters, numbers or hyphens).");
  }
  if (notes.length > 1000) {
    return rejectCheckout(req, res, "Order notes must be 1,000 characters or fewer.");
  }
  if (!acceptedTerms) {
    return rejectCheckout(req, res, "You must accept the Terms and Conditions before placing your order.");
  }

  let transaction;
  let order;
  let customer;
  let lines;
  try {
    transaction = await sequelize.transaction();
    customer = await User.findByPk(req.user.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!customer || customer.status !== "active") throw new Error("Your account is not active.");
    if (!customer.email_verified_at) throw new Error("Verify your registered email address before placing an order.");

    const storefront = await getStorefrontSettings();
    if (paymentMethod === "gcash") {
      const gcashQrFilename = await getConfiguredGcashQr(storefront);
      if (!gcashQrFilename) {
        throw new Error("The restaurant's GCash QR code is not configured. Please choose Cash on Delivery.");
      }
    }

    const cart = await Cart.findOne({
      where: { user_id: req.user.id, status: "active" },
      include: [{ model: CartItem, as: "items", include: [{ model: Product, as: "product" }] }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!cart || !cart.items.length) throw new Error("Your cart is empty or this order has already been submitted.");

    const hiddenIds = new Set((Array.isArray(storefront.hidden_product_ids) ? storefront.hidden_product_ids : []).map(Number));
    let totalCents = 0;
    lines = [];
    for (const item of cart.items) {
      if (hiddenIds.has(Number(item.product_id))) {
        throw new Error(`${item.product?.product_name || "An item"} is no longer listed on the store menu. Remove it and try again.`);
      }
      const product = await Product.findOne({
        where: { id: item.product_id, status: "active", availability: true },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!product) throw new Error(`The item ${item.product?.product_name || "in your cart"} is no longer available. Remove it and try again.`);
      const unitPriceCents = Math.round(Number(product.price) * 100);
      const lineTotalCents = unitPriceCents * item.quantity;
      totalCents += lineTotalCents;
      lines.push({
        product_id: product.id,
        product_name: product.product_name,
        unit_price: (unitPriceCents / 100).toFixed(2),
        quantity: item.quantity,
        subtotal: (lineTotalCents / 100).toFixed(2),
      });
    }

    if (paymentMethod === "gcash") {
      const duplicateReference = await Payment.findOne({ where: { reference_code: reference }, transaction });
      if (duplicateReference) throw new Error("This GCash reference number has already been submitted.");
    }

    const total = (totalCents / 100).toFixed(2);
    order = await Order.create({
      order_number: `SS-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`,
      customer_id: customer.id,
      order_type: orderType,
      delivery_address: orderType === "delivery" ? address : null,
      contact_number: phone,
      subtotal: total,
      total_amount: total,
      status: "pending",
      terms_accepted_at: new Date(),
      notes: notes || null,
    }, { transaction });
    await OrderItem.bulkCreate(lines.map(line => ({ ...line, order_id: order.id })), { transaction });
    const payment = await Payment.create({
      order_id: order.id,
      method: paymentMethod,
      amount: total,
      reference_code: paymentMethod === "gcash" ? reference : null,
      receipt_image: paymentMethod === "gcash" && req.file ? req.file.filename : null,
      status: "pending",
    }, { transaction });
    await Auditlog.create({
      user_id: customer.id,
      action: "payment_submitted",
      entity_type: "Payment",
      entity_id: payment.id,
      details: { order_id: order.id, status: "pending", amount: total },
    }, { transaction });
    await cart.update({ status: "ordered" }, { transaction });
    await Cart.create({ user_id: customer.id, status: "active" }, { transaction });
    await Notification.create({
      user_id: customer.id,
      title: "Order submitted",
      message: paymentMethod === "gcash"
        ? `Order ${order.order_number} was submitted and is awaiting GCash payment verification.`
        : `Order ${order.order_number} was submitted with Cash on Delivery.`,
      link: `/my-orders/${order.id}`,
    }, { transaction });
    await transaction.commit();
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    if (req.file?.filename) {
      try {
        await unlink(path.resolve("storage/payment-receipts", req.file.filename));
      } catch (cleanupError) {
        if (cleanupError.code !== "ENOENT") console.error("Remove uncommitted payment receipt:", cleanupError.message);
      }
    }
    console.error("Place checkout order:", error.message);
    req.flash("error_msg", error.message || "Unable to submit your order.");
    return redirectToCheckout(res);
  }

  if (paymentMethod === "cash_on_delivery" && req.file?.filename) {
    try {
      await unlink(path.resolve("storage/payment-receipts", req.file.filename));
    } catch (error) {
      if (error.code !== "ENOENT") console.error("Remove unused Cash on Delivery receipt:", error.message);
    }
  }
  const paymentLabel = paymentMethod === "gcash" ? "GCash" : "Cash on Delivery";
  const paymentStatus = paymentMethod === "gcash" ? "Pending verification" : "Due on delivery or pickup";
  const itemLines = lines.map(line => `${line.product_name} × ${line.quantity} — ${formatPeso(line.subtotal)}`).join("\n");
  const itemRows = lines.map(line => `<tr><td style="padding:10px 8px;border-bottom:1px solid #e8edf2">${escapeHtml(line.product_name)}</td><td style="padding:10px 8px;text-align:center;border-bottom:1px solid #e8edf2">${line.quantity}</td><td style="padding:10px 8px;text-align:right;border-bottom:1px solid #e8edf2">${formatPeso(line.unit_price)}</td><td style="padding:10px 8px;text-align:right;border-bottom:1px solid #e8edf2">${formatPeso(line.subtotal)}</td></tr>`).join("");
  const orderDate = new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(order.createdAt);
  const deliveryDetails = orderType === "delivery"
    ? `Delivery address: ${address}`
    : "Order type: Pickup";
  const gcashReferenceText = paymentMethod === "gcash" ? `\nGCash reference number: ${reference}` : "";
  const gcashReferenceHtml = paymentMethod === "gcash"
    ? `<p style="margin:8px 0"><strong>GCash reference:</strong> ${escapeHtml(reference)}</p>`
    : "";
  const confirmationSent = await sendTransactionalEmail({
    to: customer.email,
    subject: `ServeSync order submitted: ${order.order_number}`,
    text: [
      `Hello ${customer.full_name},`,
      "",
      `Order number: ${order.order_number}`,
      `Order date: ${orderDate}`,
      "Items:",
      itemLines,
      `Payment method: ${paymentLabel}`,
      `Payment status: ${paymentStatus}${gcashReferenceText}`,
      deliveryDetails,
      `Contact number: ${phone}`,
      `Subtotal: ${formatPeso(order.subtotal)}`,
      `Delivery fee: ${formatPeso(0)}`,
      `Total amount: ${formatPeso(order.total_amount)}`,
      "Order status: Pending",
    ].join("\n"),
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f2f6f5;font-family:Arial,sans-serif;color:#142238">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#fff;border-radius:16px;overflow:hidden">
          <tr><td style="padding:24px 28px;background:#102a29;color:#fff">
            <div style="font-size:13px;font-weight:bold;letter-spacing:2px;color:#67e1bd">SERVESYNC</div>
            <h1 style="margin:10px 0 0;font-size:24px">Your order is received</h1>
          </td></tr>
          <tr><td style="padding:26px 28px;line-height:1.55">
            <p>Hello ${escapeHtml(customer.full_name)},</p>
            <p>We received your order. Keep this email as your order confirmation.</p>
            <p style="margin:6px 0"><strong>Order number:</strong> ${escapeHtml(order.order_number)}</p>
            <p style="margin:6px 0"><strong>Order date:</strong> ${escapeHtml(orderDate)}</p>
            <p style="margin:6px 0"><strong>Order status:</strong> Pending</p>
            <p style="margin:6px 0"><strong>Payment method:</strong> ${escapeHtml(paymentLabel)}</p>
            <p style="margin:6px 0"><strong>Payment status:</strong> ${escapeHtml(paymentStatus)}</p>
            ${gcashReferenceHtml}
            <p style="margin:6px 0"><strong>${orderType === "delivery" ? "Delivery address" : "Order type"}:</strong> ${escapeHtml(orderType === "delivery" ? address : "Pickup")}</p>
            <p style="margin:6px 0"><strong>Contact number:</strong> ${escapeHtml(phone)}</p>
            <h2 style="margin:24px 0 10px;font-size:18px">Order summary</h2>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
              <thead><tr style="color:#526174;text-align:left">
                <th style="padding:8px">Item</th><th style="padding:8px;text-align:center">Qty</th>
                <th style="padding:8px;text-align:right">Unit price</th><th style="padding:8px;text-align:right">Subtotal</th>
              </tr></thead>
              <tbody>${itemRows}</tbody>
            </table>
            <p style="margin:18px 0 0;text-align:right">Subtotal: ${formatPeso(order.subtotal)}</p>
            <p style="margin:4px 0;text-align:right">Delivery fee: ${formatPeso(0)}</p>
            <p style="margin:10px 0 0;text-align:right;font-size:18px"><strong>Total: ${formatPeso(order.total_amount)}</strong></p>
            <p style="margin:22px 0 0;color:#526174;font-size:14px">We’ll notify you when your order status changes. Please contact the restaurant if you need help.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
    event: `order_submitted:${order.id}`,
  });
  req.flash("success_msg", paymentMethod === "gcash"
    ? `Order ${order.order_number} submitted. Payment status: Pending verification.${confirmationSent ? ` A copy was emailed to ${customer.email}.` : ""}`
    : `Order ${order.order_number} submitted with Cash on Delivery.${confirmationSent ? ` A copy was emailed to ${customer.email}.` : ""}`);
  if (!confirmationSent) {
    req.flash("error_msg", `Your order was placed, but the confirmation email could not be sent to ${customer.email}. Please contact the restaurant or check the mail configuration.`);
  }
  return res.redirect(`/my-orders/${order.id}`);
};
