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
import multer from "multer";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";

const publicDir = path.resolve("public/uploads");
const privateReceiptDir = path.resolve("storage/payment-receipts");
fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(privateReceiptDir, { recursive: true });
const makeStorage = destination => multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, destination),
  filename: (_req, file, cb) => {
    const extensions = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
    cb(null, `${Date.now()}-${crypto.randomBytes(12).toString("hex")}${extensions[file.mimetype] || ".img"}`);
  },
});
const imageOnly = (_req, file, cb) => {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) return cb(new Error("Only JPG, PNG and WEBP images are allowed."));
  cb(null, true);
};
export const uploadProductImage = multer({ storage: makeStorage(publicDir), fileFilter: imageOnly, limits: { fileSize: 5 * 1024 * 1024, files: 1 } }).single("imageFile");
export const uploadPaymentReceipt = multer({ storage: makeStorage(privateReceiptDir), fileFilter: imageOnly, limits: { fileSize: 5 * 1024 * 1024, files: 1 } }).single("receiptFile");


// Usage in routes/index.js:
//   import { requireUpload, requireRole } from "../middleware/upload.js";
//
//   router.get("/dashboard", requireUpload, dashboardPage);
//   router.get("/admin", requireRole("admin"), adminPage);
//   router.get("/staff", requireRole(["admin", "staff"]), staffPage);