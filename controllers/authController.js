
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
    
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcrypt";
import { User } from "../models/userModel.js";
import { issueVerificationEmail } from "../utils/emailverification.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const regenerateSession = (req) => new Promise((resolve, reject) => {
  req.session.regenerate(error => error ? reject(error) : resolve());
});

const authView = (view, title, data = {}) => ({ title: `ServeSync | ${title}`, ...data });
const safeReturnTo = (value) => {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) {
    return "";
  }
  return value;
};
const isProduction = () => process.env.NODE_ENV === "production";

function googleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const configuredRedirect = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret) return null;

  try {
    let redirectUri = configuredRedirect;
    if (!redirectUri && process.env.APP_URL) {
      redirectUri = new URL("/auth/google/callback", process.env.APP_URL).toString();
    } else if (!redirectUri && !isProduction()) {
      redirectUri = `http://localhost:${process.env.PORT || 3000}/auth/google/callback`;
    }
    if (!redirectUri) return null;
    const url = new URL(redirectUri);
    const localHost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash
      || (isProduction() && (url.protocol !== "https:" || localHost))) return null;
    return { clientId, clientSecret, redirectUri: url.toString() };
  } catch {
    return null;
  }
}

const googleConfigured = () => Boolean(googleOAuthConfig());
const authFailurePath = source => source === "register" ? "/register" : "/login";
const constantTimeMatch = (expected, actual) => {
  const expectedBuffer = Buffer.from(String(expected || ""));
  const actualBuffer = Buffer.from(String(actual || ""));
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
};

export const loginPage = (req, res) => {
  const authMessage = req.session.authMessage || null;
  const returnTo = safeReturnTo(req.query.returnTo) || safeReturnTo(req.session.returnTo);
  if (returnTo) req.session.returnTo = returnTo;
  delete req.session.authMessage;
  res.render("login", authView("login", "Sign in", { authMessage, returnTo, googleConfigured: googleConfigured() }));
};
export const registerPage = (req, res) => {
  const returnTo = safeReturnTo(req.query.returnTo) || safeReturnTo(req.session.returnTo);
  if (returnTo) req.session.returnTo = returnTo;
  res.render("register", authView("register", "Create account", { returnTo, googleConfigured: googleConfigured() }));
};
export const forgotPasswordPage = (req, res) => res.render("forgotpassword", { title: "Forgot Password" });
export const dashboardPage = (req, res) => {
  if (req.user?.role === "admin") return res.redirect("/admin");
  if (req.user?.role === "staff") return res.redirect("/staff");
  return res.redirect("/profile");
};

export const loginUser = async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const returnTo = safeReturnTo(req.body.returnTo) || safeReturnTo(req.session.returnTo);
  const user = await User.findOne({ where: { email } });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).render("login", authView("login", "Sign in", {
      error: "The email or password is incorrect.",
      authMessage: req.session.authMessage || null,
      returnTo,
      googleConfigured: googleConfigured(),
    }));
  }
  if (user.status !== "active") {
    return res.status(403).render("login", authView("login", "Sign in", {
      error: "This account is inactive. Please contact support.",
      returnTo,
      googleConfigured: googleConfigured(),
    }));
  }

  try {
    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.userRole = user.role;
    res.redirect(returnTo || "/dashboard");
  } catch (error) {
    res.status(500).render("login", authView("login", "Sign in", { error: "Unable to start your session. Please try again.", googleConfigured: googleConfigured() }));
  }
};

export const registerUser = async (req, res) => {
  const fullName = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const phone = String(req.body.phone || "").trim().slice(0, 30);
  const password = String(req.body.password || "");
  const confirmPassword = String(req.body.confirmPassword || "");
  const returnTo = safeReturnTo(req.body.returnTo) || safeReturnTo(req.session.returnTo);
  const errors = [];

  if (!fullName) errors.push("Full name is required.");
  if (!emailPattern.test(email)) errors.push("Enter a valid email address.");
  if (password.length < 12) errors.push("Password must be at least 12 characters.");
  if (password !== confirmPassword) errors.push("Passwords do not match.");
  if (errors.length) {
    return res.status(400).render("register", authView("register", "Create account", {
      errors,
      form: { fullName, email, phone },
      returnTo,
      googleConfigured: googleConfigured(),
    }));
  }

  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    return res.status(409).render("register", authView("register", "Create account", {
      errors: ["An account with that email already exists."],
      form: { fullName, email, phone },
      returnTo,
      googleConfigured: googleConfigured(),
    }));
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await User.create({
    full_name: fullName,
    email,
    phone: phone || null,
    password: hashed,
    role: "customer",
    status: "active",
  });

  let verificationResult;
  try {
    verificationResult = await issueVerificationEmail(user);
  } catch (error) {
    console.error("Create account verification email:", error.message);
  }
  await regenerateSession(req);
  req.session.userId = user.id;
  req.session.userRole = "customer";
  req.flash(verificationResult?.sent ? "success_msg" : "error_msg", verificationResult?.sent
    ? "Your account was created. Check your email to verify your address before checkout."
    : "Your account was created, but the verification email was not sent. Check the application URL and mail settings, then request another email from your profile.");
  res.redirect(returnTo || "/dashboard");
};

export const googleSignIn = (req, res) => {
  const source = req.query.source === "register" ? "register" : "login";
  const config = googleOAuthConfig();
  if (!config) {
    req.flash("error_msg", "Google sign-in is not configured. Please use email and password or contact the administrator.");
    return res.redirect(authFailurePath(source));
  }

  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const returnTo = safeReturnTo(req.query.returnTo) || safeReturnTo(req.session.returnTo);
  req.session.googleOAuth = { state, verifier, source, returnTo };

  const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizationUrl.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return res.redirect(authorizationUrl.toString());
};

async function linkGoogleUser(profile) {
  const email = String(profile.email).trim().toLowerCase();
  const googleId = String(profile.sub);
  let user = await User.findOne({ where: { google_id: googleId } });
  if (!user) user = await User.findOne({ where: { email } });

  const linkAccount = async existingUser => {
    if (existingUser.status !== "active") throw new Error("This account is inactive.");
    if (existingUser.google_id && existingUser.google_id !== googleId) {
      throw new Error("This email is already linked to another Google account.");
    }
    if (existingUser.email !== email) {
      const emailOwner = await User.findOne({ where: { email } });
      if (emailOwner && emailOwner.id !== existingUser.id) {
        throw new Error("This Google email is already used by another account.");
      }
    }
    await existingUser.update({
      email,
      google_id: googleId,
      email_verified_at: existingUser.email_verified_at || new Date(),
      email_verification_token_hash: null,
      email_verification_expires_at: null,
      email_verification_sent_at: null,
    });
    return existingUser;
  };

  if (user) return linkAccount(user);

  try {
    const password = await bcrypt.hash(randomBytes(48).toString("hex"), 12);
    return await User.create({
      full_name: String(profile.name || email.split("@")[0]).trim().slice(0, 150),
      email,
      password,
      role: "customer",
      status: "active",
      google_id: googleId,
      email_verified_at: new Date(),
    });
  } catch (error) {
    if (error.name !== "SequelizeUniqueConstraintError") throw error;
    user = await User.findOne({ where: { google_id: googleId } }) || await User.findOne({ where: { email } });
    if (!user) throw error;
    return linkAccount(user);
  }
}

export const googleCallback = async (req, res) => {
  const flow = req.session.googleOAuth;
  delete req.session.googleOAuth;
  const failurePath = authFailurePath(flow?.source);
  if (!flow || !constantTimeMatch(flow.state, req.query.state)) {
    req.flash("error_msg", "Google sign-in could not be verified. Please try again.");
    return res.redirect(failurePath);
  }
  if (req.query.error || typeof req.query.code !== "string" || !req.query.code) {
    req.flash("error_msg", "Google sign-in was cancelled or could not be completed.");
    return res.redirect(failurePath);
  }

  const config = googleOAuthConfig();
  if (!config) {
    req.flash("error_msg", "Google sign-in is not configured. Please use email and password or contact the administrator.");
    return res.redirect(failurePath);
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: req.query.code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
        code_verifier: flow.verifier,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const tokenData = await tokenResponse.json().catch(() => null);
    if (!tokenResponse.ok || !tokenData?.access_token) {
      throw new Error(`Google token exchange failed (HTTP ${tokenResponse.status}).`);
    }

    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      signal: AbortSignal.timeout(10000),
    });
    const profile = await profileResponse.json().catch(() => null);
    if (!profileResponse.ok || !profile?.sub || !profile?.email || !(profile.email_verified === true || profile.email_verified === "true")) {
      throw new Error("Google did not return a verified email address.");
    }
    if (!emailPattern.test(String(profile.email))) throw new Error("Google returned an invalid email address.");

    const user = await linkGoogleUser(profile);
    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.userRole = user.role;
    req.flash("success_msg", "You are signed in with Google.");
    return res.redirect(flow.returnTo || "/dashboard");
  } catch (error) {
    console.error("Google OAuth callback:", error.message);
    req.flash("error_msg", "Google sign-in could not be completed. Please try again or use email and password.");
    return res.redirect(failurePath);
  }
};

export const logoutUser = (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
};
