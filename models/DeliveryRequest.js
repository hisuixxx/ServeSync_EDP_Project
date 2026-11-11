import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const DeliveryRequest = sequelize.define("DeliveryRequest", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  customer_id: { type: DataTypes.INTEGER, allowNull: false },
  customer_name: { type: DataTypes.STRING(150), allowNull: false },
  contact_number: { type: DataTypes.STRING(30), allowNull: false },
  delivery_address: { type: DataTypes.STRING(500), allowNull: false },
  requested_date: { type: DataTypes.DATEONLY, allowNull: false },
  preferred_time: { type: DataTypes.TIME, allowNull: false },
  order_details: { type: DataTypes.TEXT, allowNull: false },
  special_instructions: { type: DataTypes.TEXT, allowNull: true },
  status: {
    type: DataTypes.ENUM("pending", "approved", "rejected", "completed", "cancelled"),
    allowNull: false,
    defaultValue: "pending",
  },
  rejection_reason: { type: DataTypes.TEXT, allowNull: true },
  reviewed_by: { type: DataTypes.INTEGER, allowNull: true },
  reviewed_at: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: "DeliveryRequests",
});
