import { Category, Product, StorefrontSetting } from "../models/associations.js";
import { getStorefrontSettings } from "../models/StorefrontSetting.js";
import { writeAudit } from "../utils/audit.js";
import path from "node:path";
import { access, unlink } from "node:fs/promises";
import { getConfiguredGcashQr } from "../utils/gcash.js";

const clean = (value, max) => String(value ?? "").trim().slice(0, max);
const idSet = value => new Set((Array.isArray(value) ? value : value == null ? [] : [value])
  .map(item => Number.parseInt(item, 10))
  .filter(id => Number.isSafeInteger(id) && id > 0));
const normalizeIds = (values, allowed) => [...values].filter(id => allowed.has(id));
const orderFromForm = (orderFields, id) => {
  const value = Number.parseInt(orderFields?.[id], 10);
  return Number.isSafeInteger(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
};
const safeImageUrl = value => {
  const image = clean(value, 2048);
  if (image.startsWith("/uploads/") && !image.includes("..") && !image.includes("\\")) return image;
  try {
    const parsed = new URL(image);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : "";
  } catch {
    return "";
  }
};

export const storefrontController = {
  updatePaymentSettings: async (req, res) => {
    const accountName = clean(req.body.gcashAccountName, 150);
    const gcashNumber = clean(req.body.gcashNumber, 30);
    if (!accountName || (gcashNumber && !/^\+?[0-9][0-9\s-]{6,19}$/.test(gcashNumber))) {
      req.flash("error_msg", "Enter an account name and a valid GCash number, or leave the number blank to use the QR code.");
      return res.redirect("/menu");
    }

    try {
      const current = await getStorefrontSettings();
      const currentQr = await getConfiguredGcashQr(current);
      const qrImage = req.file ? req.file.filename : currentQr;
      if (!qrImage) {
        req.flash("error_msg", "Upload the official restaurant GCash QR code before saving payment settings.");
        return res.redirect("/menu");
      }

      const record = await StorefrontSetting.findByPk(1);
      const previousQr = record.gcash_qr_image;
      await record.update({
        gcash_account_name: accountName,
        gcash_number: gcashNumber || null,
        gcash_qr_image: qrImage,
      });
      await writeAudit(req, "update_gcash_settings", "StorefrontSetting", 1, {
        gcash_account_name: accountName,
        gcash_qr_image_updated: Boolean(req.file),
      });
      if (req.file && previousQr && previousQr !== req.file.filename && /^[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(previousQr)) {
        try {
          await unlink(path.resolve("storage/payment-assets", previousQr));
        } catch (cleanupError) {
          if (cleanupError.code !== "ENOENT") console.error("Remove replaced GCash QR:", cleanupError.message);
        }
      }
      req.flash("success_msg", "Restaurant GCash payment settings updated.");
    } catch (error) {
      if (req.file?.filename) {
        try {
          await unlink(path.resolve("storage/payment-assets", req.file.filename));
        } catch (cleanupError) {
          if (cleanupError.code !== "ENOENT") console.error("Remove uncommitted GCash QR:", cleanupError.message);
        }
      }
      console.error("Update GCash settings:", error.message);
      req.flash("error_msg", "Unable to update GCash payment settings.");
    }
    res.redirect("/menu");
  },

  gcashQrImage: async (_req, res) => {
    try {
      const settings = await getStorefrontSettings();
      const filename = await getConfiguredGcashQr(settings);
      if (!filename) return res.status(404).send("GCash QR code is not configured.");
      const imagePath = path.resolve("storage/payment-assets", filename);
      await access(imagePath);
      return res.sendFile(imagePath, {
        headers: {
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      if (error.code === "ENOENT") return res.status(404).send("GCash QR code is not configured.");
      console.error("Serve GCash QR:", error.message);
      return res.status(500).send("Unable to load GCash QR code.");
    }
  },

  updateLanding: async (req, res) => {
    const heroHeadline = clean(req.body.heroHeadline, 180);
    const heroSubtitle = clean(req.body.heroSubtitle, 500);
    const heroCtaLabel = clean(req.body.heroCtaLabel, 60);
    const heroImageUrl = safeImageUrl(req.body.heroImageUrl);
    if (!heroHeadline || !heroSubtitle || !heroCtaLabel || !heroImageUrl) {
      req.flash("error_msg", "Enter landing page text and a valid HTTPS, HTTP, or local upload image URL.");
      return res.redirect("/menu");
    }

    try {
      await getStorefrontSettings();
      const record = await StorefrontSetting.findByPk(1);
      await record.update({
        hero_headline: heroHeadline,
        hero_subtitle: heroSubtitle,
        hero_cta_label: heroCtaLabel,
        hero_image_url: heroImageUrl,
      });
      await writeAudit(req, "update_storefront_landing", "StorefrontSetting", 1, { hero_headline: heroHeadline });
      req.flash("success_msg", "Landing page content updated.");
    } catch (error) {
      console.error("Update storefront landing:", error);
      req.flash("error_msg", "Unable to save landing page changes.");
    }
    res.redirect("/menu");
  },

  updateMenu: async (req, res) => {
    try {
      await getStorefrontSettings();
      const [products, categories] = await Promise.all([
        Product.findAll({ where: { status: "active" }, attributes: ["id"] }),
        Category.findAll({ where: { status: "active" }, attributes: ["id"] }),
      ]);
      const activeProductIds = new Set(products.map(product => product.id));
      const activeCategoryIds = new Set(categories.map(category => category.id));
      const visibleProductIds = normalizeIds(idSet(req.body.visibleProductIds), activeProductIds);
      const visibleSet = new Set(visibleProductIds);
      const featuredProductIds = normalizeIds(idSet(req.body.featuredProductIds), visibleSet)
        .sort((a, b) => orderFromForm(req.body.featuredProductOrder, a) - orderFromForm(req.body.featuredProductOrder, b));
      const featuredCategoryIds = normalizeIds(idSet(req.body.featuredCategoryIds), activeCategoryIds)
        .sort((a, b) => orderFromForm(req.body.featuredCategoryOrder, a) - orderFromForm(req.body.featuredCategoryOrder, b));
      const hiddenProductIds = [...activeProductIds].filter(id => !visibleSet.has(id));
      const record = await StorefrontSetting.findByPk(1);
      await record.update({
        featured_product_ids: featuredProductIds,
        hidden_product_ids: hiddenProductIds,
        featured_category_ids: featuredCategoryIds,
      });
      await writeAudit(req, "update_storefront_menu", "StorefrontSetting", 1, {
        visible_product_count: visibleProductIds.length,
        featured_product_ids: featuredProductIds,
        featured_category_ids: featuredCategoryIds,
      });
      req.flash("success_msg", "Storefront menu display settings updated.");
    } catch (error) {
      console.error("Update storefront menu:", error);
      req.flash("error_msg", "Unable to save storefront menu settings.");
    }
    res.redirect("/menu");
  },
};

