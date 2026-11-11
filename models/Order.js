import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const Order = sequelize.define("Order", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  order_number: { type: DataTypes.STRING(32), allowNull: false, unique: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  customer_name: { type: DataTypes.STRING(150), allowNull: false },
  phone: { type: DataTypes.STRING(30), allowNull: false },
  order_type: { type: DataTypes.ENUM("delivery", "pickup"), allowNull: false },
  delivery_address: { type: DataTypes.STRING(500), allowNull: true },
  pickup_instructions: { type: DataTypes.STRING(500), allowNull: true },
  total_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  status: {
    type: DataTypes.ENUM("pending", "confirmed", "preparing", "ready", "completed", "cancelled"),
    allowNull: false,
    defaultValue: "pending",
  },
  terms_accepted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  order_confirmed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, {
  tableName: "Orders",
});
