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
   
import { Product, Category, Order, OrderItem, Payment, User, CateringRequest, DeliveryRequest, Notification } from "../models/associations.js";
import { writeAudit } from "../utils/audit.js";

export const staffDashboard = async (req, res) => {
  try {
    const [activeProducts, pendingOrders, preparingOrders, approvedCatering, approvedDelivery] = await Promise.all([
      Product.count({ where: { status: "active" } }), Order.count({ where: { status: "approved" } }),
      Order.count({ where: { status: "preparing" } }), CateringRequest.count({ where: { status: "approved" } }), DeliveryRequest.count({ where: { status: "approved" } }),
    ]);
    const orders = await Order.findAll({ where: { status: ["approved", "preparing", "ready", "out_for_delivery"] }, include: [{ model: User, as: "customer", attributes: ["full_name"] }], order: [["createdAt", "DESC"]], limit: 10 });
    res.render("staff/dashboard", { title: "ServeSync Staff | Dashboard", stats: { activeProducts, pendingOrders, preparingOrders, approvedCatering, approvedDelivery }, orders: orders.map(o => o.get({ plain: true })) });
  } catch (error) { console.error("Staff dashboard:", error); res.status(500).send("Unable to load staff dashboard."); }
};
export const staffProducts = async (req, res) => {
  try { const products = await Product.findAll({ where: { status: "active" }, include: [{ model: Category, as: "category" }], order: [["createdAt", "DESC"]] }); const categories = await Category.findAll({ where: { status: "active" }, order: [["category_name", "ASC"]] }); res.render("staff/products", { title: "ServeSync Staff | Products", products: products.map(p => p.get({ plain: true })), categories }); }
  catch (error) { console.error(error); res.status(500).send("Unable to load products."); }
};
export const staffCreateProduct = async (req, res) => {
  const productName = String(req.body.product_name || "").trim(); const price = Number(req.body.price); const categoryId = Number(req.body.category_id);
  try { const category = await Category.findOne({ where: { id: categoryId, status: "active" } }); if (!productName || !category || !Number.isFinite(price) || price <= 0) { req.flash("error_msg", "Enter valid product details."); return res.redirect("/staff/products"); }
    const product = await Product.create({ category_id: categoryId, product_name: productName, description: String(req.body.description || "").trim(), price: price.toFixed(2), image: req.file ? `/uploads/${req.file.filename}` : (String(req.body.image || "").trim() || null), availability: req.body.availability === "on", status: "active" });
    await writeAudit(req, "staff_create_product", "Product", product.id, { product_name: productName }); req.flash("success_msg", "Product added.");
  } catch (error) { console.error(error); req.flash("error_msg", "Unable to add product."); } res.redirect("/staff/products");
};
export const staffUpdateProduct = async (req, res) => {
  try { const product = await Product.findOne({ where: { id: req.params.id, status: "active" } }); if (!product) return res.status(404).send("Product not found.");
    const category = await Category.findOne({ where: { id: Number(req.body.category_id), status: "active" } }); const name = String(req.body.product_name || "").trim(); const price = Number(req.body.price);
    if (!category || !name || !Number.isFinite(price) || price <= 0) { req.flash("error_msg", "Invalid product details."); return res.redirect("/staff/products"); }
    await product.update({ category_id: category.id, product_name: name, description: String(req.body.description || "").trim(), price: price.toFixed(2), image: req.file ? `/uploads/${req.file.filename}` : (String(req.body.image || "").trim() || product.image), availability: req.body.availability === "on" });
    await writeAudit(req, "staff_update_product", "Product", product.id, { product_name: name }); req.flash("success_msg", "Product updated.");
  } catch (error) { console.error(error); req.flash("error_msg", "Unable to update product."); } res.redirect("/staff/products");
};
export const staffOrders = async (req, res) => {
  try { const orders = await Order.findAll({ where: { status: ["approved", "preparing", "ready", "out_for_delivery"] }, include: [{ model: User, as: "customer", attributes: ["full_name", "phone"] }, { model: OrderItem, as: "items" }, { model: Payment, as: "payment" }], order: [["createdAt", "DESC"]] }); res.render("staff/orders", { title: "ServeSync Staff | Orders", orders: orders.map(o => o.get({ plain: true })) }); }
  catch (error) { console.error(error); res.status(500).send("Unable to load orders."); }
};
export const staffUpdateOrderStatus = async (req, res) => {
  const allowed = ["preparing", "ready", "out_for_delivery"];
  if (!allowed.includes(req.body.status)) { req.flash("error_msg", "Invalid operational status."); return res.redirect("/staff/orders"); }
  try { const order = await Order.findByPk(req.params.id); if (!order || !["approved", "preparing", "ready", "out_for_delivery"].includes(order.status)) { req.flash("error_msg", "Order is not available for staff processing."); return res.redirect("/staff/orders"); }
    if (req.body.status === "out_for_delivery" && order.order_type !== "delivery") { req.flash("error_msg", "Only delivery orders can be marked out for delivery."); return res.redirect("/staff/orders"); }
    const allowedTransitions = { approved: ["preparing"], preparing: ["ready"], ready: ["out_for_delivery"] };
    if (!allowedTransitions[order.status]?.includes(req.body.status)) { req.flash("error_msg", "This order cannot move to that status from its current state."); return res.redirect("/staff/orders"); }
    await order.update({ status: req.body.status }); await Notification.create({ user_id: order.customer_id, title: "Order status updated", message: `Your order ${order.order_number} is now ${req.body.status.replaceAll("_", " ")}.`, link: `/my-orders/${order.id}` }); await writeAudit(req, "staff_update_order", "Order", order.id, { status: req.body.status }); req.flash("success_msg", "Order updated.");
  } catch (error) { console.error(error); req.flash("error_msg", "Unable to update order."); } res.redirect("/staff/orders");
};
