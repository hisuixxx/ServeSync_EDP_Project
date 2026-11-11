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

import { User } from "../models/userModel.js";

export const loadCurrentUser = async (req, res, next) => {
  res.locals.currentUser = null;
  res.locals.isCustomer = false;
  res.locals.isStaff = false;
  res.locals.isAdmin = false;

  if (!req.session.userId) return next();

  try {
    const user = await User.findByPk(req.session.userId);
    if (!user || user.status !== "active") {
      req.session.destroy(() => {});
      res.locals.isAuthenticated = false;
      return next();
    }

    req.user = user;
    res.locals.currentUser = user;
    res.locals.isCustomer = user.role === "customer";
    res.locals.isStaff = user.role === "staff";
    res.locals.isAdmin = user.role === "admin";
    res.locals.isAuthenticated = true;
    next();
  } catch (error) {
    next(error);
  }
};

export const requireAuth = async (req, res, next) => {
  if (!req.session.userId) {
    const returnTo = req.originalUrl;
    if (returnTo.startsWith("/") && !returnTo.startsWith("//")) {
      req.session.returnTo = returnTo.startsWith("/cart/items/")
        ? `/menu/${req.params.id}`
        : returnTo;
    }
    req.session.authMessage = returnTo.startsWith("/cart/items/")
      ? "You must create an account or log in before adding items to your cart."
      : "Please log in or create an account to continue.";
    return res.redirect("/login");
  }

  try {
    const user = req.user || await User.findByPk(req.session.userId);
    if (!user || user.status !== "active") {
      req.session.destroy(() => {});
      return res.redirect("/login");
    }

    req.user = user;
    res.locals.currentUser = user;
    res.locals.isCustomer = user.role === "customer";
    res.locals.isStaff = user.role === "staff";
    res.locals.isAdmin = user.role === "admin";
    next();
  } catch (error) {
    next(error);
  }
};

export const requireRole = (role) => [
  requireAuth,
  (req, res, next) => {
    const allowed = Array.isArray(role) ? role : [role];

    if (!req.user || !allowed.includes(req.user.role)) {
      req.session.authMessage = "You do not have permission to perform this action.";
      return res.redirect("/login");
    }

    next();
  },
];

export const requireCustomer = requireRole("customer");

// Usage in routes/index.js:
//   import { requireAuth, requireRole } from "../middleware/auth.js";
//
//   router.get("/dashboard", requireAuth, dashboardPage);
//   router.get("/admin", requireRole("admin"), adminPage);
//   router.get("/staff", requireRole(["admin", "staff"]), staffPage);