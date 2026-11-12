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
import bcrypt from "bcrypt";
import { Op } from "sequelize";
import { User } from "../models/associations.js";
import { writeAudit } from "../utils/audit.js";

export const adminUsers = async (req, res) => {
  try {
    const search = String(req.query.search || "").trim().slice(0, 100);
    const where = {};
    if (search) where[Op.or] = [{ full_name: { [Op.like]: `%${search}%` } }, { email: { [Op.like]: `%${search}%` } }];
    const users = await User.findAll({ where, attributes: { exclude: ["password"] }, order: [["createdAt", "DESC"]], limit: 300 });
    res.render("admin/user", { title: "ServeSync Admin | User Management", users: users.map(x => ({ ...x.get({ plain: true }), isCustomer: x.role === "customer", isStaff: x.role === "staff", isAdmin: x.role === "admin", isActive: x.status === "active", isInactive: x.status === "inactive" })), search });
  } catch (error) { console.error("User list:", error); res.status(500).send("Unable to load users."); }
};

export const adminCreateStaff = async (req, res) => {
  const fullName = String(req.body.full_name || "").trim(); const email = String(req.body.email || "").trim().toLowerCase(); const password = String(req.body.password || "");
  if (!fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12) { req.flash("error_msg", "Enter a name, valid email and password with at least 12 characters."); return res.redirect("/admin/users"); }
  try { const hash = await bcrypt.hash(password, 12); const user = await User.create({ full_name: fullName, email, password: hash, role: "staff", status: "active" }); await writeAudit(req, "create_staff", "User", user.id, { email }); req.flash("success_msg", "Staff account created."); }
  catch (error) { req.flash("error_msg", "Unable to create staff account. Email may already exist."); }
  res.redirect("/admin/users");
};

export const adminUpdateUser = async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id); if (!user) return res.status(404).send("User not found.");
    if (user.id === req.user.id && req.body.status === "inactive") { req.flash("error_msg", "You cannot deactivate your own account."); return res.redirect("/admin/users"); }
    if (user.role === "admin" && user.id !== req.user.id && req.body.role && req.body.role !== "admin") { req.flash("error_msg", "Admin role changes for another administrator are disabled for safety."); return res.redirect("/admin/users"); }
    const role = ["admin", "staff", "customer"].includes(req.body.role) ? req.body.role : user.role;
    const status = req.body.status === "inactive" ? "inactive" : "active";
    await user.update({ full_name: String(req.body.full_name || user.full_name).trim(), phone: String(req.body.phone || "").trim() || null, role, status });
    await writeAudit(req, "update_user", "User", user.id, { role, status }); req.flash("success_msg", "User updated."); res.redirect("/admin/users");
  } catch (error) { console.error("Update user:", error); req.flash("error_msg", "Unable to update user."); res.redirect("/admin/users"); }
};

export const adminResetUserPassword = async (req, res) => {
  const password = String(req.body.new_password || "");
  if (password.length < 12) { req.flash("error_msg", "New password must be at least 12 characters."); return res.redirect("/admin/users"); }
  try { const user = await User.findByPk(req.params.id); if (!user) return res.status(404).send("User not found."); user.password = await bcrypt.hash(password, 12); await user.save(); await writeAudit(req, "reset_user_password", "User", user.id); req.flash("success_msg", "Password reset successfully."); }
  catch (error) { req.flash("error_msg", "Unable to reset password."); }
  res.redirect("/admin/users");
};

export const adminDeleteUser = async (req, res) => {
  try { const user = await User.findByPk(req.params.id); if (!user) return res.status(404).send("User not found.");
    if (user.id === req.user.id || user.role === "admin") { req.flash("error_msg", "You cannot delete your own account or an administrator account."); return res.redirect("/admin/users"); }
    const [orders, carts, catering, delivery, requestHistory] = await Promise.all([user.countOrders(), user.countCarts(), user.countCateringRequests(), user.countDeliveryRequests(), user.countRequestStatusChanges()]).catch(() => [1,1,1,1,1]);
    if (orders || carts || catering || delivery || requestHistory) { req.flash("error_msg", "This user has linked records. Deactivate the account instead to preserve transaction history."); return res.redirect("/admin/users"); }
    await writeAudit(req, "delete_user", "User", user.id, { email: user.email }); await user.destroy(); req.flash("success_msg", "User deleted.");
  } catch (error) { console.error("Delete user:", error); req.flash("error_msg", "User cannot be deleted because linked records exist. Deactivate instead."); }
  res.redirect("/admin/users");
};

