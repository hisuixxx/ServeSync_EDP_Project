
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
const router = express.Router();
router.get("/", homePage);
router.get("/menu", productcontroller.menu);
router.get("/menu/:id", productcontroller.detail);
router.get("/request/catering", requireCustomer, serviceRequestController.cateringForm);
router.post("/request/catering", requireCustomer, serviceRequestController.createCatering);
router.get("/request/delivery", requireCustomer, serviceRequestController.deliveryForm);
router.post("/request/delivery", requireCustomer, serviceRequestController.createDelivery);
router.get("/my-requests", requireCustomer, serviceRequestController.listCustomerRequests);
router.get("/admin/requests/catering", requireRole("admin"), serviceRequestController.adminCateringRequests);
router.get("/admin/requests/delivery", requireRole("admin"), serviceRequestController.adminDeliveryRequests);
router.post("/admin/requests/:type(catering|delivery)/:id/status", requireRole("admin"), serviceRequestController.updateRequestStatus);
router.get("/staff/requests/catering", requireRole(["staff", "admin"]), serviceRequestController.staffCateringRequests);
router.get("/staff/requests/delivery", requireRole(["staff", "admin"]), serviceRequestController.staffDeliveryRequests);
router.get("/cart", requireCustomer, cartController.cartPage);
router.post("/cart/items/:id", requireCustomer, cartController.addToCart);
router.post("/cart/items/:id/increase", requireCustomer, cartController.increaseCartItem);
router.post("/cart/items/:id/decrease", requireCustomer, cartController.decreaseCartItem);
router.post("/cart/items/:id/remove", requireCustomer, cartController.removeCartItem);
router.post("/cart/order", requireCustomer, cartController.placeOrder);

import { loginPage, registerPage, forgotPasswordPage, dashboardPage, loginUser, registerUser, logoutUser } from "../controllers/authController.js";

router.get("/login", loginPage);
router.post("/login", loginUser);
router.get("/register", registerPage);
router.post("/register", registerUser);
router.get("/forgot-password", forgotPasswordPage);
router.get("/dashboard", requireAuth, dashboardPage);
router.get("/profile", requireCustomer, profilePage);
router.post("/profile", requireCustomer, updateProfile);
router.post("/profile/password", requireCustomer, changePassword);
router.get("/logout", logoutUser);

export default router;
