/*
    MIT License
    
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    */
import { Op } from "sequelize";
import { Order, OrderItem, Payment, User, Notification } from "../models/associations.js";
import { writeAudit } from "../utils/audit.js";
import path from "node:path";
import { access } from "node:fs/promises";

export const adminOrders = async (req, res) => {
  try {
    const status = String(req.query.status || "");
    const where = status ? { status } : {};
    const orders = await Order.findAll({ where, include: [{ model: User, as: "customer", attributes: ["id", "full_name", "email", "phone"] }, { model: Payment, as: "payment" }], order: [["createdAt", "DESC"]], limit: 200 });
    res.render("admin/orders", { title: "ServeSync Admin | Orders", orders: orders.map(x => x.get({ plain: true })), selectedStatus: status });
  } catch (error) { console.error("Admin orders:", error); res.status(500).send("Unable to load orders."); }
};

export const adminOrderDetail = async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id, { include: [{ model: User, as: "customer" }, { model: OrderItem, as: "items" }, { model: Payment, as: "payment" }] });
    if (!order) return res.status(404).send("Order not found.");
    res.render("admin/order-detail", { title: `Order ${order.order_number}`, order: order.get({ plain: true }) });
  } catch (error) { console.error("Order detail:", error); res.status(500).send("Unable to load order."); }
};

export const adminUpdateOrderStatus = async (req, res) => {
  const allowed = ["approved", "preparing", "ready", "out_for_delivery", "completed", "rejected", "cancelled"];
  const nextStatus = String(req.body.status || "");
  if (!allowed.includes(nextStatus)) { req.flash("error_msg", "Invalid order status."); return res.redirect(`/admin/orders/${req.params.id}`); }
  try {
    const order = await Order.findByPk(req.params.id, { include: [{ model: Payment, as: "payment" }] });
    if (!order) return res.status(404).send("Order not found.");
    if (nextStatus === "approved" && order.payment?.status !== "verified") { req.flash("error_msg", "Verify the GCash payment before approving this order."); return res.redirect(`/admin/orders/${order.id}`); }
    if (["preparing", "ready", "out_for_delivery", "completed"].includes(nextStatus) && !["approved", "preparing", "ready", "out_for_delivery"].includes(order.status)) { req.flash("error_msg", "This order must be approved before operational status updates."); return res.redirect(`/admin/orders/${order.id}`); }
    const previous = order.status;
    const transitions = {
      pending: ["approved", "rejected", "cancelled"],
      approved: ["preparing", "cancelled"],
      preparing: ["ready", "cancelled"],
      ready: order.order_type === "delivery" ? ["out_for_delivery", "completed", "cancelled"] : ["completed", "cancelled"],
      out_for_delivery: ["completed", "cancelled"],
      completed: [], rejected: [], cancelled: [],
    };
    if (!transitions[previous]?.includes(nextStatus)) { req.flash("error_msg", `Cannot change an order from ${previous} to ${nextStatus}.`); return res.redirect(`/admin/orders/${order.id}`); }
    await order.update({ status: nextStatus, reviewed_by: req.user.id, reviewed_at: new Date() });
    await Notification.create({ user_id: order.customer_id, title: "Order status updated", message: `Your order ${order.order_number} changed from ${previous} to ${nextStatus.replaceAll("_", " ")}.`, link: `/my-orders/${order.id}` });
    await writeAudit(req, "update_order_status", "Order", order.id, { previous, nextStatus });
    req.flash("success_msg", "Order status updated."); res.redirect(`/admin/orders/${order.id}`);
  } catch (error) { console.error("Update order status:", error); req.flash("error_msg", "Unable to update order."); res.redirect("/admin/orders"); }
};

export const adminPayments = async (req, res) => {
  try {
    const payments = await Payment.findAll({ include: [{ model: Order, as: "order", include: [{ model: User, as: "customer", attributes: ["full_name", "email"] }] }], order: [["createdAt", "DESC"]], limit: 250 });
    res.render("admin/payments", { title: "ServeSync Admin | Payments", payments: payments.map(p => p.get({ plain: true })) });
  } catch (error) { console.error("Payments:", error); res.status(500).send("Unable to load payments."); }
};

export const adminVerifyPayment = async (req, res) => {
  const status = req.body.status === "verified" ? "verified" : req.body.status === "rejected" ? "rejected" : null;
  if (!status) { req.flash("error_msg", "Choose a valid payment decision."); return res.redirect("/admin/payments"); }
  try {
    const payment = await Payment.findByPk(req.params.id, { include: [{ model: Order, as: "order" }] });
    if (!payment) return res.status(404).send("Payment not found.");
    await payment.update({ status, verified_by: req.user.id, verified_at: new Date(), remarks: String(req.body.remarks || "").trim().slice(0, 1000) || null });
    if (status === "rejected" && payment.order?.status === "pending") await payment.order.update({ status: "pending" });
    await Notification.create({ user_id: payment.order.customer_id, title: status === "verified" ? "Payment verified" : "Payment rejected", message: status === "verified" ? `Payment for order ${payment.order.order_number} has been verified. The administrator can now approve the order.` : `Payment for order ${payment.order.order_number} was rejected. Please contact the restaurant. ${payment.remarks || ""}`, link: `/my-orders/${payment.order.id}` });
    await writeAudit(req, `payment_${status}`, "Payment", payment.id, { order_id: payment.order_id, reference_code: payment.reference_code });
    req.flash("success_msg", `Payment marked ${status}.`); res.redirect("/admin/payments");
  } catch (error) { console.error("Verify payment:", error); req.flash("error_msg", "Unable to update payment."); res.redirect("/admin/payments"); }
};

export const adminPaymentReceipt = async (req, res) => {
  try {
    const payment = await Payment.findByPk(req.params.id);
    if (!payment?.receipt_image || path.basename(payment.receipt_image) !== payment.receipt_image) return res.status(404).send("Receipt not found.");
    const filePath = path.resolve("storage/payment-receipts", payment.receipt_image);
    await access(filePath);
    return res.sendFile(filePath, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return res.status(404).send("Receipt not found."); }
};

export { productcontroller };