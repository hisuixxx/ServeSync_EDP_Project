import { User } from "../models/userModel.js";
import { issueVerificationEmail, verificationTokenHash } from "../utils/emailverification.js";

export const resendVerificationEmail = async (req, res) => {
  const returnTo = req.body.returnTo === "/cart?checkout=1" ? "/cart?checkout=1" : "/profile";
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.sendStatus(404);
    if (user.email_verified_at) {
      req.flash("success_msg", "Your email address is already verified.");
      return res.redirect(returnTo);
    }

    const result = await issueVerificationEmail(user);
    if (result.reason === "cooldown") {
      req.flash("error_msg", `Please wait ${result.cooldownSeconds} seconds before requesting another verification email.`);
      return res.redirect(returnTo);
    }
    if (!result.sent && result.reason === "already_verified") {
      req.flash("success_msg", "Your email address is already verified.");
      return res.redirect(returnTo);
    }
    if (!result.sent) {
      req.flash("error_msg", "Unable to send the verification email. Confirm the application URL and SMTP settings, then try again.");
      return res.redirect(returnTo);
    }
    req.flash("success_msg", "A verification email has been sent to your registered email address. Check your inbox and spam folder.");
    res.redirect(returnTo);
  } catch (error) {
    console.error("Resend email verification:", error.message);
    req.flash("error_msg", "Unable to send the verification email. Please try again later.");
    res.redirect(returnTo);
  }
};

export const verifyEmail = async (req, res) => {
  const token = String(req.params.token || "");
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    req.flash("error_msg", "This email verification link is invalid or expired.");
    return res.redirect(req.session.userId ? "/profile" : "/login");
  }

  try {
    const user = await User.findOne({
      where: {
        email_verification_token_hash: verificationTokenHash(token),
      },
    });
    if (!user || !user.email_verification_expires_at || user.email_verification_expires_at < new Date()) {
      req.flash("error_msg", "This email verification link is invalid or expired. Request a new one from your profile.");
      return res.redirect(req.session.userId ? "/profile" : "/login");
    }

    await user.update({
      email_verified_at: new Date(),
      email_verification_token_hash: null,
      email_verification_expires_at: null,
      email_verification_sent_at: null,
    });
    req.flash("success_msg", "Your email address is verified. You can now check out.");
    if (!req.session.userId) req.session.returnTo = "/cart?checkout=1";
    res.redirect(req.session.userId === user.id ? "/cart?checkout=1" : "/login");
  } catch (error) {
    console.error("Verify email:", error.message);
    res.status(500).send("Unable to verify your email address.");
  }
};
