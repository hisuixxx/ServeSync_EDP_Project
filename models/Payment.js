import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const Payment = sequelize.define("Payment", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  order_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  method: { type: DataTypes.ENUM("GCash"), allowNull: false },
  reference_code: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  verified_by: { type: DataTypes.INTEGER, allowNull: true },
  verified_at: { type: DataTypes.DATE, allowNull: true },
  status: {
    type: DataTypes.ENUM("pending", "verified", "paid", "rejected"),
    allowNull: false,
    defaultValue: "pending",
  },
}, {
  tableName: "Payments",
});
