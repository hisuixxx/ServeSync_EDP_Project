import { Category, Product, StorefrontSetting } from "../models/associations.js";
import { getStorefrontSettings } from "../models/StorefrontSetting.js";
import { writeAudit } from "../utils/audit.js";

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

