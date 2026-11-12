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
import { randomUUID } from "node:crypto";
import { sequelize } from "../models/db.js";
import { Cart, CartItem, Product, Order, OrderItem, Payment, Notification } from "../models/associations.js";

const safeText = (v, max = 500) => String(v ?? "").trim().slice(0, max);

export const checkoutPage = async (req, res) => {
  try {
    const cart = await Cart.findOne({
      where: { user_id: req.user.id, status: "active" },
      include: [{ model: CartItem, as: "items", include: [{ model: Product, as: "product" }] }],
    });
    const items = (cart?.items || []).filter(i => i.product && i.product.status === "active" && i.product.availability);
    if (!items.length) {
      req.flash("error_msg", "Your cart is empty or contains unavailable products.");
      return res.redirect("/cart");
    }
    const total = items.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0);
    res.render("customer/checkout", {
      title: "ServeSync | Checkout",
      items: items.map(i => ({ product_name: i.product.product_name, quantity: i.quantity, price: Number(i.product.price).toFixed(2), subtotal: (Number(i.product.price) * i.quantity).toFixed(2) })),
      total: total.toFixed(2),
      gcashName: process.env.GCASH_ACCOUNT_NAME || "ServeSync Restaurant",
      gcashNumber: process.env.GCASH_NUMBER || "Set GCASH_NUMBER in .env",
      gcashQr: process.env.GCASH_QR_IMAGE || "",
    });
  } catch (error) {
    console.error("Checkout page:", error);
    res.status(500).send("Unable to load checkout.");
  }
};

export const placeCheckoutOrder = async (req, res) => {
  if (!['on', 'true', '1'].includes(String(req.body.acceptTerms || "").toLowerCase())) {
    req.flash("error_msg", "You must read and accept the terms and conditions before placing your order.");
    return res.redirect("/checkout");
  }
  const reference = safeText(req.body.reference_code, 100).replace(/\s+/g, "");
  const orderType = req.body.order_type === "delivery" ? "delivery" : "pickup";
  const address = safeText(req.body.delivery_address, 500);
  const phone = safeText(req.body.contact_number, 30);
  if (!/^[A-Za-z0-9-]{6,100}$/.test(reference)) {
    req.flash("error_msg", "Enter a valid GCash reference code (6–100 letters, numbers or hyphens).");
    return res.redirect("/checkout");
  }
  if (orderType === "delivery" && address.length < 8) {
    req.flash("error_msg", "Please enter a complete delivery address.");
    return res.redirect("/checkout");
  }

  let transaction;
  try {
    transaction = await sequelize.transaction();
    const cart = await Cart.findOne({
      where: { user_id: req.user.id, status: "active" },
      include: [{ model: CartItem, as: "items", include: [{ model: Product, as: "product" }] }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!cart || !cart.items.length) throw new Error("Your cart is empty.");
    let total = 0;
    const lines = [];
    for (const item of cart.items) {
      const product = await Product.findOne({ where: { id: item.product_id, status: "active", availability: true }, transaction, lock: transaction.LOCK.UPDATE });
      if (!product) throw new Error(`The item ${item.product?.product_name || "in your cart"} is no longer available. Remove it and try again.`);
      const unitPrice = Number(product.price);
      const lineTotal = Math.round(unitPrice * item.quantity * 100) / 100;
      total += lineTotal;
      lines.push({ product_id: product.id, product_name: product.product_name, unit_price: unitPrice.toFixed(2), quantity: item.quantity, subtotal: lineTotal.toFixed(2) });
    }
    total = Math.round(total * 100) / 100;
    const duplicateReference = await Payment.findOne({ where: { reference_code: reference }, transaction });
    if (duplicateReference) throw new Error("This GCash reference code has already been submitted.");
    const order = await Order.create({
      order_number: `SS-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`,
      customer_id: req.user.id, order_type: orderType,
      delivery_address: orderType === "delivery" ? address : null,
      contact_number: phone || req.user.phone || null,
      subtotal: total.toFixed(2), total_amount: total.toFixed(2),
      status: "pending", terms_accepted_at: new Date(), notes: safeText(req.body.notes, 1000) || null,
    }, { transaction });
    await OrderItem.bulkCreate(lines.map(line => ({ ...line, order_id: order.id })), { transaction });
    await Payment.create({ order_id: order.id, method: "gcash", amount: total.toFixed(2), reference_code: reference, receipt_image: req.file ? req.file.filename : null, status: "pending" }, { transaction });
    await cart.update({ status: "ordered" }, { transaction });
    await Cart.create({ user_id: req.user.id, status: "active" }, { transaction });
    await Notification.create({ user_id: req.user.id, title: "Order submitted", message: `Order ${order.order_number} was submitted and is awaiting payment verification.`, link: `/my-orders/${order.id}` }, { transaction });
    await transaction.commit();
    req.flash("success_msg", `Order ${order.order_number} submitted. Payment status: Pending verification.`);
    return res.redirect(`/my-orders/${order.id}`);
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    console.error("Place checkout order:", error);
    req.flash("error_msg", error.message || "Unable to submit your order.");
    return res.redirect("/checkout");
  }
};

