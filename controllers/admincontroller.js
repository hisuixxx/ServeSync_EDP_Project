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
import { User, Product, Category, Order, Payment, CateringRequest, DeliveryRequest } from "../models/associations.js";
import { writeAudit } from "../utils/audit.js";

const pageData = (title, data = {}) => ({ title: `ServeSync Admin | ${title}`, ...data });
const pageNumber = value => Math.max(1, Number.parseInt(value, 10) || 1);

export const adminDashboard = async (req, res) => {
  try {
    const [products, archived, users, orders, pendingOrders, pendingPayments, catering, delivery, recentOrders] = await Promise.all([
      Product.count({ where: { status: "active" } }), Product.count({ where: { status: "archived" } }),
      User.count({ where: { role: "customer" } }), Order.count(), Order.count({ where: { status: "pending" } }),
      Payment.count({ where: { status: "pending" } }), CateringRequest.count({ where: { status: "pending" } }),
      DeliveryRequest.count({ where: { status: "pending" } }),
      Order.findAll({ include: [{ model: User, as: "customer", attributes: ["full_name", "email"] }], order: [["createdAt", "DESC"]], limit: 8 }),
    ]);
    res.render("admin/dashboard", pageData("Dashboard", { stats: { products, archived, users, orders, pendingOrders, pendingPayments, catering, delivery }, recentOrders: recentOrders.map(x => x.get({ plain: true })) }));
  } catch (error) { console.error("Admin dashboard:", error); res.status(500).send("Unable to load the administrator dashboard. Check database migration."); }
};

export const adminProducts = async (req, res) => {
  try {
    const page = pageNumber(req.query.page); const search = String(req.query.search || "").trim().slice(0, 100);
    const where = { status: "active" };
    if (search) where[Op.or] = [{ product_name: { [Op.like]: `%${search}%` } }, { description: { [Op.like]: `%${search}%` } }];
    const result = await Product.findAndCountAll({ where, include: [{ model: Category, as: "category" }], order: [["createdAt", "DESC"]], limit: 10, offset: (page - 1) * 10 });
    const products = result.rows.map(x => x.get({ plain: true }));
    res.render("admin/products", pageData("Products", { products, search, page, pages: Math.max(1, Math.ceil(result.count / 10)), hasPrev: page > 1, hasNext: page < Math.max(1, Math.ceil(result.count / 10)), prevPage: Math.max(1, page - 1), nextPage: page + 1, categories: await Category.findAll({ where: { status: "active" }, order: [["category_name", "ASC"]] }) }));
  } catch (error) { console.error("Admin products:", error); res.status(500).send("Unable to load products."); }
};

export const adminCreateProduct = async (req, res) => {
  const name = String(req.body.product_name || "").trim(); const price = Number(req.body.price); const categoryId = Number(req.body.category_id);
  if (!name || name.length > 150 || !Number.isFinite(price) || price <= 0 || !Number.isInteger(categoryId)) { req.flash("error_msg", "Enter a valid product name, category and positive price."); return res.redirect("/admin/products"); }
  try {
    const category = await Category.findOne({ where: { id: categoryId, status: "active" } });
    if (!category) { req.flash("error_msg", "Choose an active category."); return res.redirect("/admin/products"); }
    const product = await Product.create({ category_id: categoryId, product_name: name, description: String(req.body.description || "").trim(), price: price.toFixed(2), image: req.file ? `/uploads/${req.file.filename}` : (String(req.body.image || "").trim() || null), availability: req.body.availability === "on", status: "active" });
    await writeAudit(req, "create_product", "Product", product.id, { product_name: name }); req.flash("success_msg", "Product created."); res.redirect("/admin/products");
  } catch (error) { console.error("Create product:", error); req.flash("error_msg", "Unable to create product."); res.redirect("/admin/products"); }
};

export const adminUpdateProduct = async (req, res) => {
  try {
    const product = await Product.findOne({ where: { id: req.params.id, status: "active" } }); if (!product) return res.status(404).send("Product not found.");
    const name = String(req.body.product_name || "").trim(); const price = Number(req.body.price); const categoryId = Number(req.body.category_id);
    const category = await Category.findOne({ where: { id: categoryId, status: "active" } });
    if (!name || name.length > 150 || !Number.isFinite(price) || price <= 0 || !category) { req.flash("error_msg", "Invalid product information."); return res.redirect("/admin/products"); }
    await product.update({ product_name: name, description: String(req.body.description || "").trim(), price: price.toFixed(2), category_id: categoryId, image: req.file ? `/uploads/${req.file.filename}` : (String(req.body.image || "").trim() || null), availability: req.body.availability === "on" });
    await writeAudit(req, "update_product", "Product", product.id, { product_name: name }); req.flash("success_msg", "Product updated."); res.redirect("/admin/products");
  } catch (error) { console.error("Update product:", error); res.status(500).send("Unable to update product."); }
};

export const adminArchiveProduct = async (req, res) => {
  try { const product = await Product.findOne({ where: { id: req.params.id, status: "active" } }); if (!product) return res.status(404).send("Active product not found.");
    await product.update({ status: "archived", availability: false, archived_at: new Date(), archived_by: req.user.id }); await writeAudit(req, "archive_product", "Product", product.id, { product_name: product.product_name }); req.flash("success_msg", "Product moved to archive."); res.redirect("/admin/products");
  } catch (error) { console.error("Archive product:", error); res.status(500).send("Unable to archive product."); }
};

export const adminArchiveList = async (req, res) => {
  try { const products = await Product.findAll({ where: { status: "archived" }, include: [{ model: Category, as: "category" }], order: [["archived_at", "DESC"]] }); res.render("admin/archive", pageData("Product Archive", { products: products.map(x => x.get({ plain: true })) })); }
  catch (error) { console.error("Archive list:", error); res.status(500).send("Unable to load archive."); }
};

export const adminRestoreProduct = async (req, res) => {
  try { const product = await Product.findOne({ where: { id: req.params.id, status: "archived" } }); if (!product) return res.status(404).send("Archived product not found.");
    const category = await Category.findOne({ where: { id: product.category_id, status: "active" } }); if (!category) { req.flash("error_msg", "Restore the product's category first."); return res.redirect("/admin/archive"); }
    await product.update({ status: "active", archived_at: null, archived_by: null, availability: true }); await writeAudit(req, "restore_product", "Product", product.id, { product_name: product.product_name }); req.flash("success_msg", "Product restored."); res.redirect("/admin/archive");
  } catch (error) { console.error("Restore product:", error); res.status(500).send("Unable to restore product."); }
};

export const adminCategories = async (req, res) => {
  const categories = await Category.findAll({ order: [["category_name", "ASC"]], include: [{ model: Product, as: "products", attributes: ["id"] }] });
  res.render("admin/categories", pageData("Categories", { categories: categories.map(c => ({ ...c.get({ plain: true }), productCount: c.products.length })) }));
};
export const adminCreateCategory = async (req, res) => {
  const name = String(req.body.category_name || "").trim(); if (!name) { req.flash("error_msg", "Category name is required."); return res.redirect("/admin/categories"); }
  try { await Category.create({ category_name: name, description: String(req.body.description || "").trim(), status: "active" }); req.flash("success_msg", "Category created."); } catch (e) { req.flash("error_msg", "Could not create category. Check if the name already exists."); } res.redirect("/admin/categories");
};
export const adminUpdateCategory = async (req, res) => {
  const category = await Category.findByPk(req.params.id); if (!category) return res.status(404).send("Category not found.");
  const name = String(req.body.category_name || "").trim(); if (!name) { req.flash("error_msg", "Category name is required."); return res.redirect("/admin/categories"); }
  await category.update({ category_name: name, description: String(req.body.description || "").trim(), status: req.body.status === "inactive" ? "inactive" : "active" }); req.flash("success_msg", "Category updated."); res.redirect("/admin/categories");
};

export { admincontroller };