
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
    import express from "express";
import { homePage } from "../controllers/homeController.js";
import { productcontroller } from "../controllers/productcontroller.js";
import { cartController } from "../controllers/cartController.js";
import { profilePage, updateProfile, changePassword } from "../controllers/profileController.js";
import { serviceRequestController } from "../controllers/servicerequestcontroller.js";
import { requireAuth, requireCustomer, requireRole } from "../middleware/auth.js";
import { uploadProductImage, uploadPaymentReceipt } from "../middleware/upload.js";
import { loginPage, registerPage, forgotPasswordPage, loginUser, registerUser, logoutUser } from "../controllers/authController.js";
import { checkoutPage, placeCheckoutOrder } from "../controllers/checkoutcontroller.js";
import { adminDashboard, adminProducts, adminCreateProduct, adminUpdateProduct, adminArchiveProduct, adminArchiveList, adminRestoreProduct, adminCategories, adminCreateCategory, adminUpdateCategory } from "../controllers/admincontroller.js";
import { adminUsers, adminCreateStaff, adminUpdateUser, adminResetUserPassword, adminDeleteUser } from "../controllers/usercontroller.js";
import { adminOrders, adminOrderDetail, adminUpdateOrderStatus, adminPayments, adminVerifyPayment, adminPaymentReceipt } from "../controllers/ordermanagementcontroller.js";
import { staffDashboard, staffProducts, staffCreateProduct, staffUpdateProduct, staffOrders, staffUpdateOrderStatus } from "../controllers/staffcontroller.js";
import { customerOrders, customerOrderDetail, customerNotifications, markNotificationRead } from "../controllers/customerordercontroller.js";

const router = express.Router();

// Public pages and authentication
router.get("/", homePage);
router.get("/menu", productcontroller.menu);
router.get("/menu/:id", productcontroller.detail);
router.get("/login", loginPage);
router.post("/login", loginUser);
router.get("/register", registerPage);
router.post("/register", registerUser);
router.get("/forgot-password", forgotPasswordPage);
router.get("/logout", logoutUser);
router.post("/logout", logoutUser);

// Signed-in customer account
router.get("/dashboard", requireAuth, (req, res) => {
  if (req.user.role === "admin") return res.redirect("/admin");
  if (req.user.role === "staff") return res.redirect("/staff");
  return res.redirect("/profile");
});
router.get("/profile", requireAuth, profilePage);
router.post("/profile", requireAuth, updateProfile);
router.post("/profile/password", requireAuth, changePassword);

// Cart and checkout. Customers only.
router.get("/cart", requireCustomer, cartController.cartPage);
router.post("/cart/items/:id", requireCustomer, cartController.addToCart);
router.post("/cart/items/:id/increase", requireCustomer, cartController.increaseCartItem);
router.post("/cart/items/:id/decrease", requireCustomer, cartController.decreaseCartItem);
router.post("/cart/items/:id/remove", requireCustomer, cartController.removeCartItem);
router.post("/cart/order", requireCustomer, (req, res) => res.redirect("/checkout"));
router.get("/checkout", requireCustomer, checkoutPage);
router.post("/checkout/place", requireCustomer, uploadPaymentReceipt, placeCheckoutOrder);

// Customer service requests
router.get("/request/catering", requireCustomer, serviceRequestController.cateringForm);
router.post("/request/catering", requireCustomer, serviceRequestController.createCatering);
router.get("/request/delivery", requireCustomer, serviceRequestController.deliveryForm);
router.post("/request/delivery", requireCustomer, serviceRequestController.createDelivery);
router.get("/my-requests", requireCustomer, serviceRequestController.listCustomerRequests);
router.get("/my-orders", requireCustomer, customerOrders);
router.get("/my-orders/:id", requireCustomer, customerOrderDetail);
router.get("/my-notifications", requireCustomer, customerNotifications);
router.post("/my-notifications/:id/read", requireCustomer, markNotificationRead);

// Administrator routes
router.get("/admin", requireRole("admin"), adminDashboard);
router.get("/admin/products", requireRole("admin"), adminProducts);
router.post("/admin/products", requireRole("admin"), uploadProductImage, adminCreateProduct);
router.post("/admin/products/:id/update", requireRole("admin"), uploadProductImage, adminUpdateProduct);
router.post("/admin/products/:id/archive", requireRole("admin"), adminArchiveProduct);
router.get("/admin/archive", requireRole("admin"), adminArchiveList);
router.post("/admin/archive/:id/restore", requireRole("admin"), adminRestoreProduct);
router.get("/admin/categories", requireRole("admin"), adminCategories);
router.post("/admin/categories", requireRole("admin"), adminCreateCategory);
router.post("/admin/categories/:id/update", requireRole("admin"), adminUpdateCategory);
router.get("/admin/users", requireRole("admin"), adminUsers);
router.post("/admin/users/staff", requireRole("admin"), adminCreateStaff);
router.post("/admin/users/:id/update", requireRole("admin"), adminUpdateUser);
router.post("/admin/users/:id/password", requireRole("admin"), adminResetUserPassword);
router.post("/admin/users/:id/delete", requireRole("admin"), adminDeleteUser);
router.get("/admin/orders", requireRole("admin"), adminOrders);
router.get("/admin/orders/:id", requireRole("admin"), adminOrderDetail);
router.post("/admin/orders/:id/status", requireRole("admin"), adminUpdateOrderStatus);
router.get("/admin/payments", requireRole("admin"), adminPayments);
router.get("/admin/payments/:id/receipt", requireRole("admin"), adminPaymentReceipt);
router.post("/admin/payments/:id/verify", requireRole("admin"), adminVerifyPayment);
router.get("/admin/requests/catering", requireRole("admin"), serviceRequestController.adminCateringRequests);
router.get("/admin/requests/delivery", requireRole("admin"), serviceRequestController.adminDeliveryRequests);
router.post("/admin/requests/:type(catering|delivery)/:id/status", requireRole("admin"), serviceRequestController.updateRequestStatus);

// Staff routes: no archive, user management, request approval or payment verification.
router.get("/staff", requireRole("staff"), staffDashboard);
router.get("/staff/products", requireRole("staff"), staffProducts);
router.post("/staff/products", requireRole("staff"), uploadProductImage, staffCreateProduct);
router.post("/staff/products/:id/update", requireRole("staff"), uploadProductImage, staffUpdateProduct);
router.get("/staff/orders", requireRole("staff"), staffOrders);
router.post("/staff/orders/:id/status", requireRole("staff"), staffUpdateOrderStatus);
router.get("/staff/requests/catering", requireRole("staff"), serviceRequestController.staffCateringRequests);
router.get("/staff/requests/delivery", requireRole("staff"), serviceRequestController.staffDeliveryRequests);

router.use((req, res) => res.status(404).render("not-found", { title: "ServeSync | Page not found" }));

export default router;
