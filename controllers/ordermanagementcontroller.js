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
import { Order, OrderItem, Payment, User, Notification, Auditlog } from "../models/associations.js";
import { sequelize } from "../models/db.js";
import { sendTransactionalEmail } from "../utils/mailer.js";
import path from "node:path";
import { access } from "node:fs/promises";

export const adminOrders = async (req, res) => {
  try {
    const status = String(req.query.status || "");
    const where = status ? { status } : {};
    const orders = await Order.findAll({ where, include: [{ model: User, as: "customer", attributes: ["id", "full_name", "email", "phone"] }, { model: OrderItem, as: "items" }, { model: Payment, as: "payment" }], order: [["createdAt", "DESC"]], limit: 200 });
    const transitions = {
      pending: ["approved", "rejected", "cancelled"],
      approved: ["preparing", "cancelled"],
      preparing: ["ready", "cancelled"],
      ready: ["completed", "cancelled"],
      out_for_delivery: ["completed", "cancelled"],
      completed: [], rejected: [], cancelled: [],
    };
    const rows = orders.map(order => {
      const plain = order.get({ plain: true });
      if (plain.payment) {
        plain.payment.methodLabel = plain.payment.method === "cash_on_delivery" ? "Cash on Delivery" : "GCash";
        plain.payment.statusLabel = plain.payment.method === "cash_on_delivery" && plain.payment.status === "pending"
          ? "Due on delivery"
          : plain.payment.status === "verified" ? "Paid" : plain.payment.status === "rejected" ? "Rejected" : "Pending Verification";
      }
      const paymentSettled = plain.payment?.method === "cash_on_delivery" || plain.payment?.status === "verified";
      const allowed = (transitions[plain.status] || []).filter(next => next !== "approved" || paymentSettled);
      if (plain.status === "ready" && plain.order_type === "delivery" && paymentSettled) allowed.unshift("out_for_delivery");
      return {
        ...plain,
        canUpdate: allowed.length > 0,
        statusOptions: allowed.map(value => ({
          value,
          label: ({ approved: "Approve", rejected: "Reject", cancelled: "Cancel", preparing: "Preparing", ready: "Ready", out_for_delivery: "Out for delivery", completed: "Complete" })[value],
        })),
      };
    });
    res.render("admin/orders", { title: "ServeSync Admin | Orders", orders: rows, selectedStatus: status });
  } catch (error) { console.error("Admin orders:", error); res.status(500).send("Unable to load orders."); }
};

export const adminOrderDetail = async (req, res) => {
  try {
    const order = await Order.findByPk(req.params.id, { include: [{ model: User, as: "customer" }, { model: OrderItem, as: "items" }, { model: Payment, as: "payment" }] });
    if (!order) return res.status(404).send("Order not found.");
    const plain = order.get({ plain: true });
    if (plain.payment) {
      plain.payment.methodLabel = plain.payment.method === "cash_on_delivery" ? "Cash on Delivery" : "GCash";
      plain.payment.statusLabel = plain.payment.method === "cash_on_delivery" && plain.payment.status === "pending"
        ? "Due on delivery"
        : plain.payment.status === "verified" ? "Paid" : plain.payment.status === "rejected" ? "Rejected" : "Pending Verification";
    }
    res.render("admin/order-detail", { title: `Order ${order.order_number}`, order: plain });
  } catch (error) { console.error("Order detail:", error); res.status(500).send("Unable to load order."); }
};

export const adminUpdateOrderStatus = async (req, res) => {
  const returnToList = req.body.returnTo === "/admin/orders";
  const redirectTo = id => returnToList ? "/admin/orders" : `/admin/orders/${id}`;
  const allowed = ["approved", "preparing", "ready", "out_for_delivery", "completed", "rejected", "cancelled"];
  const nextStatus = String(req.body.status || "");
  if (!allowed.includes(nextStatus)) { req.flash("error_msg", "Invalid order status."); return res.redirect(redirectTo(req.params.id)); }
  let transaction;
  let order;
  let previous;
  try {
    transaction = await sequelize.transaction();
    order = await Order.findByPk(req.params.id, {
      include: [{ model: Payment, as: "payment" }, { model: User, as: "customer" }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!order) {
      await transaction.rollback();
      return res.status(404).send("Order not found.");
    }
    if (nextStatus === "approved" && order.payment?.method !== "cash_on_delivery" && order.payment?.status !== "verified") throw new Error("Verify the GCash payment before approving this order.");
    if (["preparing", "ready", "out_for_delivery", "completed"].includes(nextStatus) && !["approved", "preparing", "ready", "out_for_delivery"].includes(order.status)) throw new Error("This order must be approved before operational status updates.");
    previous = order.status;
    const transitions = {
      pending: ["approved", "rejected", "cancelled"],
      approved: ["preparing", "cancelled"],
      preparing: ["ready", "cancelled"],
      ready: order.order_type === "delivery" ? ["out_for_delivery", "completed", "cancelled"] : ["completed", "cancelled"],
      out_for_delivery: ["completed", "cancelled"],
      completed: [], rejected: [], cancelled: [],
    };
    if (!transitions[previous]?.includes(nextStatus)) throw new Error(`Cannot change an order from ${previous} to ${nextStatus}.`);
    await order.update({ status: nextStatus, reviewed_by: req.user.id, reviewed_at: new Date() }, { transaction });
    await Notification.create({
      user_id: order.customer_id,
      title: "Order status updated",
      message: `Your order ${order.order_number} changed from ${previous} to ${nextStatus.replaceAll("_", " ")}.`,
      link: `/my-orders/${order.id}`,
    }, { transaction });
    await Auditlog.create({
      user_id: req.user.id,
      action: "update_order_status",
      entity_type: "Order",
      entity_id: order.id,
      details: { previous, nextStatus },
      ip_address: String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].slice(0, 64) || null,
    }, { transaction });
    await transaction.commit();

    if (previous !== nextStatus && order.customer?.email) {
      const label = ({ approved: "Confirmed", preparing: "Preparing", ready: order.order_type === "delivery" ? "Ready for dispatch" : "Ready for Pickup", out_for_delivery: "Out for Delivery", completed: "Completed", cancelled: "Cancelled", rejected: "Rejected" })[nextStatus] || nextStatus;
      const paymentStatus = order.payment?.method === "cash_on_delivery" && order.payment?.status === "pending"
        ? "Due on delivery"
        : order.payment?.status === "verified" ? "Paid" : order.payment?.status === "rejected" ? "Rejected" : "Pending Verification";
      await sendTransactionalEmail({
        to: order.customer.email,
        subject: `ServeSync order update: ${order.order_number}`,
        text: `Hello ${order.customer.full_name},\n\nYour order ${order.order_number} is now ${label}.\nCurrent order status: ${label}.\nPayment status: ${paymentStatus}.`,
        event: `order_status:${order.id}:${nextStatus}`,
      });
    }
    req.flash("success_msg", "Order status updated."); res.redirect(redirectTo(order.id));
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    console.error("Update order status:", error.message);
    req.flash("error_msg", error.message || "Unable to update order.");
    res.redirect(redirectTo(order?.id || req.params.id));
  }
};

export const adminPayments = async (req, res) => {
  try {
    const [payments, history] = await Promise.all([
      Payment.findAll({ include: [{ model: Order, as: "order", include: [{ model: User, as: "customer", attributes: ["full_name", "email"] }] }], order: [["createdAt", "DESC"]], limit: 250 }),
      Auditlog.findAll({
        where: { entity_type: "Payment", action: { [Op.in]: ["payment_submitted", "payment_verified", "payment_rejected"] } },
        include: [{ model: User, as: "actor", attributes: ["full_name"] }],
        order: [["createdAt", "DESC"]],
        limit: 500,
      }),
    ]);
    const historyByPayment = new Map();
    for (const entry of history) {
      const key = String(entry.entity_id);
      historyByPayment.set(key, [...(historyByPayment.get(key) || []), entry.get({ plain: true })]);
    }
    res.render("admin/payments", {
      title: "ServeSync Admin | Payments",
      payments: payments.map(payment => ({
        ...payment.get({ plain: true }),
        methodLabel: payment.method === "cash_on_delivery" ? "Cash on Delivery" : "GCash",
        statusLabel: payment.method === "cash_on_delivery" && payment.status === "pending" ? "Due on delivery" : payment.status === "verified" ? "Paid" : payment.status === "rejected" ? "Rejected" : "Pending Verification",
        verificationHistory: historyByPayment.get(String(payment.id)) || [],
        canDecide: payment.status === "pending",
        canReject: payment.status === "pending" && payment.method === "gcash",
      })),
    });
  } catch (error) { console.error("Payments:", error); res.status(500).send("Unable to load payments."); }
};

export const adminVerifyPayment = async (req, res) => {
  const status = req.body.status === "verified" ? "verified" : req.body.status === "rejected" ? "rejected" : null;
  if (!status) { req.flash("error_msg", "Choose a valid payment decision."); return res.redirect("/admin/payments"); }
  const remarks = String(req.body.remarks || "").trim().slice(0, 1000);
  if (status === "rejected" && remarks.length < 5) {
    req.flash("error_msg", "Enter a rejection reason of at least 5 characters.");
    return res.redirect("/admin/payments");
  }
  let transaction;
  let payment;
  try {
    transaction = await sequelize.transaction();
    payment = await Payment.findByPk(req.params.id, {
      include: [{ model: Order, as: "order", include: [{ model: User, as: "customer" }] }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!payment) {
      await transaction.rollback();
      return res.status(404).send("Payment not found.");
    }
    if (payment.status !== "pending") {
      await transaction.rollback();
      req.flash("error_msg", "This payment has already been reviewed.");
      return res.redirect("/admin/payments");
    }
    if (payment.method === "cash_on_delivery" && status === "rejected") {
      await transaction.rollback();
      req.flash("error_msg", "Cash on Delivery payments can only be marked as collected.");
      return res.redirect("/admin/payments");
    }
    await payment.update({ status, verified_by: req.user.id, verified_at: new Date(), remarks: remarks || null }, { transaction });
    await Auditlog.create({
      user_id: req.user.id,
      action: `payment_${status}`,
      entity_type: "Payment",
      entity_id: payment.id,
      details: { order_id: payment.order_id, reference_code: payment.reference_code, previous_status: "pending", status, remarks: remarks || null },
      ip_address: String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].slice(0, 64) || null,
    }, { transaction });
    await Notification.create({
      user_id: payment.order.customer_id,
      title: status === "verified" ? (payment.method === "cash_on_delivery" ? "Cash collected" : "Payment verified") : "Payment rejected",
      message: status === "verified"
        ? payment.method === "cash_on_delivery"
          ? `Cash payment for order ${payment.order.order_number} was collected.`
          : `Payment for order ${payment.order.order_number} was verified. The administrator can now confirm the order.`
        : `Payment for order ${payment.order.order_number} was rejected. Reason: ${remarks}`,
      link: `/my-orders/${payment.order.id}`,
    }, { transaction });
    await transaction.commit();

    if (payment.order.customer?.email) {
      const isVerified = status === "verified";
      const methodLabel = payment.method === "cash_on_delivery" ? "Cash on Delivery" : "GCash";
      await sendTransactionalEmail({
        to: payment.order.customer.email,
        subject: isVerified
          ? `ServeSync payment verified: ${payment.order.order_number}`
          : `ServeSync payment needs attention: ${payment.order.order_number}`,
        text: isVerified
          ? `Hello ${payment.order.customer.full_name},\n\n${payment.method === "cash_on_delivery" ? "Cash payment" : "Payment"} for order ${payment.order.order_number} has been ${payment.method === "cash_on_delivery" ? "collected" : "verified"}.\nConfirmed payment amount: PHP ${payment.amount}\nPayment method: ${methodLabel}\nPayment status: Paid\nCurrent order status: ${payment.order.status}.`
          : `Hello ${payment.order.customer.full_name},\n\nPayment for order ${payment.order.order_number} was rejected.\nReason: ${remarks}\nPayment status: Rejected\nPlease review the payment details and contact ServeSync before submitting a corrected payment reference. Do not send another payment unless the restaurant instructs you to do so.`,
        event: `payment_${status}:${payment.id}`,
      });
    }
    req.flash("success_msg", `Payment marked ${status}.`); res.redirect("/admin/payments");
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    console.error("Verify payment:", error.message);
    req.flash("error_msg", "Unable to update payment.");
    res.redirect("/admin/payments");
  }
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

