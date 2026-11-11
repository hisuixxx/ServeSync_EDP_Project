import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const OrderItem = sequelize.define("OrderItem", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  order_id: { type: DataTypes.INTEGER, allowNull: false },
  product_id: { type: DataTypes.INTEGER, allowNull: true },
  product_name: { type: DataTypes.STRING(150), allowNull: false },
  product_image: { type: DataTypes.STRING(255), allowNull: true },
  unit_price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false },
  subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
}, {
  tableName: "OrderItems",
});
