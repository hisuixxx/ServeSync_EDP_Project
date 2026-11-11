
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
import { User } from "../models/userModel.js";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const regenerateSession = (req) => new Promise((resolve, reject) => {
  req.session.regenerate(error => error ? reject(error) : resolve());
});

const authView = (view, title, data = {}) => ({ title: `ServeSync | ${title}`, ...data });
const safeReturnTo = (value) => {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "";
  }
  return value;
};

export const loginPage = (req, res) => {
  const authMessage = req.session.authMessage || null;
  const returnTo = safeReturnTo(req.query.returnTo) || safeReturnTo(req.session.returnTo);
  delete req.session.authMessage;
  res.render("login", authView("login", "Sign in", { authMessage, returnTo }));
};
export const registerPage = (req, res) => {
  const returnTo = safeReturnTo(req.query.returnTo) || safeReturnTo(req.session.returnTo);
  res.render("register", authView("register", "Create account", { returnTo }));
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
    }));
  }
  if (user.status !== "active") {
    return res.status(403).render("login", authView("login", "Sign in", {
      error: "This account is inactive. Please contact support.",
      returnTo,
    }));
  }

  try {
    await regenerateSession(req);
    req.session.userId = user.id;
    req.session.userRole = user.role;
    res.redirect(returnTo || "/dashboard");
  } catch (error) {
    res.status(500).render("login", authView("login", "Sign in", { error: "Unable to start your session. Please try again." }));
  }
};

export const registerUser = async (req, res) => {
  const fullName = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
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
      form: { fullName, email },
      returnTo,
    }));
  }

  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    return res.status(409).render("register", authView("register", "Create account", {
      errors: ["An account with that email already exists."],
      form: { fullName, email },
      returnTo,
    }));
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await User.create({
    full_name: fullName,
    email,
    password: hashed,
    role: "customer",
    status: "active",
  });

  await regenerateSession(req);
  req.session.userId = user.id;
  req.session.userRole = "customer";
  res.redirect(returnTo || "/dashboard");
};

export const logoutUser = (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
};
