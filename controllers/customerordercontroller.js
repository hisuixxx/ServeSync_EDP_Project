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
import { Order, OrderItem, Payment, Notification } from "../models/associations.js";

export const customerOrders = async (req, res) => {
  try { const orders = await Order.findAll({ where: { customer_id: req.user.id }, include: [{ model: Payment, as: "payment" }], order: [["createdAt", "DESC"]] }); res.render("customer/orders", { title: "ServeSync | My Orders", orders: orders.map(o => o.get({ plain: true })) }); }
  catch (error) { console.error("Customer orders:", error); res.status(500).send("Unable to load your orders."); }
};
export const customerOrderDetail = async (req, res) => {
  try { const order = await Order.findOne({ where: { id: req.params.id, customer_id: req.user.id }, include: [{ model: OrderItem, as: "items" }, { model: Payment, as: "payment" }] }); if (!order) return res.status(404).send("Order not found."); res.render("customer/order-detail", { title: `ServeSync | ${order.order_number}`, order: order.get({ plain: true }) }); }
  catch (error) { console.error(error); res.status(500).send("Unable to load order."); }
};
export const customerNotifications = async (req, res) => {
  try { const notifications = await Notification.findAll({ where: { user_id: req.user.id }, order: [["createdAt", "DESC"]], limit: 100 }); res.render("customer/notifications", { title: "ServeSync | Notifications", notifications: notifications.map(n => n.get({ plain: true })) }); }
  catch (error) { console.error(error); res.status(500).send("Unable to load notifications."); }
};
export const markNotificationRead = async (req, res) => {
  try { const notification = await Notification.findOne({ where: { id: req.params.id, user_id: req.user.id } }); if (notification) await notification.update({ is_read: true }); res.redirect(req.body.returnTo === "orders" ? "/my-orders" : "/my-notifications"); }
  catch (error) { console.error(error); res.redirect("/my-notifications"); }
};
