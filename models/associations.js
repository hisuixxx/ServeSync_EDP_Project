import { Category } from "./Category.js";
import { Product } from "./Product.js";
import { User } from "./userModel.js";
import { Cart } from "./Cart.js";
import { CartItem } from "./Cartitem.js";

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

export { Category, Product, User, Cart, CartItem };