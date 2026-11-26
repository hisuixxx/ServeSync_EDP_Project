import bcrypt from "bcrypt";
import { User } from "../models/userModel.js";
import { issueVerificationEmail } from "../utils/emailverification.js";

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

  if (!fullName || (email !== req.user.email && !emailPattern.test(email))) {
    return res.status(400).render("customer/profile", {
      title: "ServeSync | Your profile",
      user: { ...req.user.get({ plain: true }), full_name: fullName, phone },
      profileError: "Enter a full name and valid email address.",
    });
  }
  const emailChanged = email !== req.user.email;
  try {
    if (emailChanged) {
      const duplicate = await User.findOne({ where: { email } });
      if (duplicate && duplicate.id !== req.user.id) {
        return res.status(409).render("customer/profile", {
          title: "ServeSync | Your profile",
          user: { ...req.user.get({ plain: true }), full_name: fullName, phone },
          profileError: "That email address is already in use.",
        });
      }
    }
    await req.user.update({
      full_name: fullName,
      email,
      phone,
      ...(emailChanged ? {
        email_verified_at: null,
        email_verification_token_hash: null,
        email_verification_expires_at: null,
        email_verification_sent_at: null,
      } : {}),
    });
    let profileSuccess = "Profile updated successfully.";
    if (emailChanged) {
      try {
        const verificationResult = await issueVerificationEmail(req.user);
        profileSuccess = verificationResult.sent
          ? "Profile updated. Check your new email address for a verification link before checkout."
          : "Profile updated, but the verification email was not sent. Check the application URL and mail settings, then request another email.";
      } catch (verificationError) {
        console.error("Send changed-email verification:", verificationError.message);
        profileSuccess = "Profile updated, but the verification email could not be sent. Please request another email after checking the mail settings.";
      }
    }
    res.render("customer/profile", {
      title: "ServeSync | Your profile",
      user: req.user,
      profileSuccess,
    });
  } catch (error) {
    console.error("Update customer profile:", error.message);
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).render("customer/profile", {
        title: "ServeSync | Your profile",
        user: { ...req.user.get({ plain: true }), full_name: fullName, phone },
        profileError: "That email address is already in use.",
      });
    }
    res.status(500).render("customer/profile", {
      title: "ServeSync | Your profile",
      user: req.user,
      profileError: "Unable to update your profile. Please try again.",
    });
  }
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