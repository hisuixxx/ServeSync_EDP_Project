import { Category } from "./Category.js";
import { Product } from "./Product.js";
import { User } from "./userModel.js";
import { Cart } from "./Cart.js";
import { CartItem } from "./Cartitem.js";
import { Order } from "./Order.js";
import { OrderItem } from "./Orderitem.js";
import { Payment } from "./Payment.js";

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

User.hasMany(Order, {
  foreignKey: "user_id",
  as: "orders",
  onUpdate: "CASCADE",
  onDelete: "RESTRICT",
});

Order.belongsTo(User, {
  foreignKey: "user_id",
  as: "customer",
});

Order.hasMany(OrderItem, {
  foreignKey: "order_id",
  as: "items",
  onUpdate: "CASCADE",
  onDelete: "CASCADE",
});

OrderItem.belongsTo(Order, {
  foreignKey: "order_id",
  as: "order",
});

Product.hasMany(OrderItem, {
  foreignKey: "product_id",
  as: "orderItems",
  onUpdate: "CASCADE",
  onDelete: "SET NULL",
});

OrderItem.belongsTo(Product, {
  foreignKey: "product_id",
  as: "product",
});

Order.hasOne(Payment, {
  foreignKey: "order_id",
  as: "payment",
  onUpdate: "CASCADE",
  onDelete: "CASCADE",
});

Payment.belongsTo(Order, {
  foreignKey: "order_id",
  as: "order",
});

User.hasMany(Payment, {
  foreignKey: "verified_by",
  as: "verifiedPayments",
  onUpdate: "CASCADE",
  onDelete: "SET NULL",
});

Payment.belongsTo(User, {
  foreignKey: "verified_by",
  as: "verifier",
});

export { Category, Product, User, Cart, CartItem, Order, OrderItem, Payment };