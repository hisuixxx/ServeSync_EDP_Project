import { Category } from "./Category.js";
import { Product } from "./Product.js";
import { User } from "./userModel.js";
import { Cart } from "./Cart.js";
import { CartItem } from "./Cartitem.js";
import { CateringRequest } from "./CateringRequest.js";
import { DeliveryRequest } from "./DeliveryRequest.js";
import { RequestStatusHistory } from "./RequestStatusHistory.js";

// Category-Product associations
Category.hasMany(Product, {
  foreignKey: "category_id",
  as: "products",
  onUpdate: "CASCADE",
  onDelete: "RESTRICT",
});

Product.belongsTo(Category, {
  foreignKey: "category_id",
  as: "category",
});

// User-Cart associations
User.hasMany(Cart, {
  foreignKey: "user_id",
  as: "carts",
  onUpdate: "CASCADE",
  onDelete: "CASCADE",
});

Cart.belongsTo(User, {
  foreignKey: "user_id",
  as: "user",
});

// Cart-CartItem associations
Cart.hasMany(CartItem, {
  foreignKey: "cart_id",
  as: "items",
  onUpdate: "CASCADE",
  onDelete: "CASCADE",
});

CartItem.belongsTo(Cart, {
  foreignKey: "cart_id",
  as: "cart",
});

// Product-CartItem associations
Product.hasMany(CartItem, {
  foreignKey: "product_id",
  as: "cartItems",
  onUpdate: "CASCADE",
  onDelete: "CASCADE",
});

CartItem.belongsTo(Product, {
  foreignKey: "product_id",
  as: "product",
});

User.hasMany(CateringRequest, {
  foreignKey: "customer_id",
  as: "cateringRequests",
  onUpdate: "CASCADE",
  onDelete: "RESTRICT",
});
CateringRequest.belongsTo(User, {
  foreignKey: "customer_id",
  as: "customer",
});
User.hasMany(CateringRequest, {
  foreignKey: "reviewed_by",
  as: "reviewedCateringRequests",
});
CateringRequest.belongsTo(User, {
  foreignKey: "reviewed_by",
  as: "reviewer",
});

User.hasMany(DeliveryRequest, {
  foreignKey: "customer_id",
  as: "deliveryRequests",
  onUpdate: "CASCADE",
  onDelete: "RESTRICT",
});
DeliveryRequest.belongsTo(User, {
  foreignKey: "customer_id",
  as: "customer",
});
User.hasMany(DeliveryRequest, {
  foreignKey: "reviewed_by",
  as: "reviewedDeliveryRequests",
});
DeliveryRequest.belongsTo(User, {
  foreignKey: "reviewed_by",
  as: "reviewer",
});

CateringRequest.hasMany(RequestStatusHistory, {
  foreignKey: "catering_request_id",
  as: "history",
  onUpdate: "CASCADE",
  onDelete: "CASCADE",
});
RequestStatusHistory.belongsTo(CateringRequest, {
  foreignKey: "catering_request_id",
  as: "cateringRequest",
});

DeliveryRequest.hasMany(RequestStatusHistory, {
  foreignKey: "delivery_request_id",
  as: "history",
  onUpdate: "CASCADE",
  onDelete: "CASCADE",
});
RequestStatusHistory.belongsTo(DeliveryRequest, {
  foreignKey: "delivery_request_id",
  as: "deliveryRequest",
});

User.hasMany(RequestStatusHistory, {
  foreignKey: "changed_by",
  as: "requestStatusChanges",
  onUpdate: "CASCADE",
  onDelete: "RESTRICT",
});
RequestStatusHistory.belongsTo(User, {
  foreignKey: "changed_by",
  as: "changedBy",
});

export {
  Category,
  Product,
  User,
  Cart,
  CartItem,
  CateringRequest,
  DeliveryRequest,
  RequestStatusHistory,
};