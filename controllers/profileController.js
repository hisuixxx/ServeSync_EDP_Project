import bcrypt from "bcrypt";
import { User } from "../models/userModel.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const profilePage = (req, res) => {
  res.render("customer/profile", {
    title: "ServeSync | Your profile",
    user: req.user,
  });
};

export const updateProfile = async (req, res) => {
  const fullName = String(req.body.fullName || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const phone = String(req.body.phone || "").trim() || null;

  if (!fullName || !emailPattern.test(email)) {
    return res.status(400).render("customer/profile", {
      title: "ServeSync | Your profile",
      user: { ...req.user.get({ plain: true }), full_name: fullName, email, phone },
      profileError: "Enter a full name and valid email address.",
    });
  }

  const duplicate = await User.findOne({ where: { email } });
  if (duplicate && duplicate.id !== req.user.id) {
    return res.status(409).render("customer/profile", {
      title: "ServeSync | Your profile",
      user: { ...req.user.get({ plain: true }), full_name: fullName, email, phone },
      profileError: "That email address is already in use.",
    });
  }

  await req.user.update({ full_name: fullName, email, phone });
  res.render("customer/profile", { title: "ServeSync | Your profile", user: req.user, profileSuccess: "Profile updated successfully." });
};

export const changePassword = async (req, res) => {
  const currentPassword = String(req.body.currentPassword || "");
  const newPassword = String(req.body.newPassword || "");
  const confirmPassword = String(req.body.confirmPassword || "");
  const matches = await bcrypt.compare(currentPassword, req.user.password);

  if (!matches || newPassword.length < 12 || newPassword !== confirmPassword) {
    return res.status(400).render("customer/profile", {
      title: "ServeSync | Your profile",
      user: req.user,
      passwordError: !matches ? "Current password is incorrect." : "New passwords must match and be at least 12 characters.",
    });
  }

  req.user.password = await bcrypt.hash(newPassword, 12);
  await req.user.save();
  res.render("customer/profile", { title: "ServeSync | Your profile", user: req.user, passwordSuccess: "Password changed successfully." });
};