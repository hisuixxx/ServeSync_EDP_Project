import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const StorefrontSetting = sequelize.define("StorefrontSetting", {
  id: { type: DataTypes.INTEGER, primaryKey: true, defaultValue: 1 },
  hero_headline: { type: DataTypes.STRING(180), allowNull: false, defaultValue: "Good food. Easy ordering." },
  hero_subtitle: { type: DataTypes.STRING(500), allowNull: false, defaultValue: "Discover your next favorite meal, browse our menu, and order from the comfort of your home." },
  hero_cta_label: { type: DataTypes.STRING(60), allowNull: false, defaultValue: "Explore Menu →" },
  hero_image_url: { type: DataTypes.STRING(2048), allowNull: false, defaultValue: "https://images.unsplash.com/photo-1579027989536-b7b1f875659b?auto=format&fit=crop&w=2000&q=84" },
  featured_product_ids: { type: DataTypes.JSON, allowNull: true },
  hidden_product_ids: { type: DataTypes.JSON, allowNull: true },
  featured_category_ids: { type: DataTypes.JSON, allowNull: true },
  gcash_account_name: { type: DataTypes.STRING(150), allowNull: false, defaultValue: "ServeSync Gcash" },
  gcash_number: { type: DataTypes.STRING(30), allowNull: true },
  gcash_qr_image: { type: DataTypes.STRING(255), allowNull: true },
}, {
  tableName: "StorefrontSettings",
});

export const DEFAULT_STOREFRONT_SETTINGS = Object.freeze({
  id: 1,
  hero_headline: "Good food. Easy ordering.",
  hero_subtitle: "Discover your next favorite meal, browse our menu, and order from the comfort of your home.",
  hero_cta_label: "Explore Menu →",
  hero_image_url: "https://images.unsplash.com/photo-1579027989536-b7b1f875659b?auto=format&fit=crop&w=2000&q=84",
  featured_product_ids: [],
  hidden_product_ids: [],
  featured_category_ids: [],
  gcash_account_name: "ServeSync Gcash",
  gcash_number: process.env.GCASH_NUMBER || "",
  gcash_qr_image: process.env.GCASH_QR_IMAGE || "servesync-gcash.png",
});

export async function getStorefrontSettings() {
  let settings = await StorefrontSetting.findByPk(1);
  if (!settings) {
    try {
      settings = await StorefrontSetting.create(DEFAULT_STOREFRONT_SETTINGS);
    } catch (error) {
      // Another request may have initialized the singleton at the same time.
      if (error.name !== "SequelizeUniqueConstraintError") throw error;
      settings = await StorefrontSetting.findByPk(1);
    }
  }
  const plain = settings.get({ plain: true });
  const defaultQrImage = process.env.GCASH_QR_IMAGE || "servesync-gcash.png";
  return {
    ...DEFAULT_STOREFRONT_SETTINGS,
    ...plain,
    featured_product_ids: Array.isArray(plain.featured_product_ids) ? plain.featured_product_ids : [],
    hidden_product_ids: Array.isArray(plain.hidden_product_ids) ? plain.hidden_product_ids : [],
    featured_category_ids: Array.isArray(plain.featured_category_ids) ? plain.featured_category_ids : [],
    gcash_account_name: plain.gcash_account_name === "ServeSync Restaurant"
      ? "ServeSync Gcash"
      : plain.gcash_account_name || "ServeSync Gcash",
    gcash_number: plain.gcash_number || process.env.GCASH_NUMBER || "",
    gcash_qr_image: plain.gcash_qr_image || defaultQrImage,
  };
}
