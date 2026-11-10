import { Category } from "./Category.js";
import { Product } from "./Product.js";

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

export { Category, Product };