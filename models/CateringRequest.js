import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const CateringRequest = sequelize.define("CateringRequest", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  customer_id: { type: DataTypes.INTEGER, allowNull: false },
  customer_name: { type: DataTypes.STRING(150), allowNull: false },
  contact_number: { type: DataTypes.STRING(30), allowNull: false },
  email: { type: DataTypes.STRING(255), allowNull: false },
  event_date: { type: DataTypes.DATEONLY, allowNull: false },
  event_time: { type: DataTypes.TIME, allowNull: false },
  event_location: { type: DataTypes.STRING(500), allowNull: false },
  guest_count: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 10000 } },
  food_preferences: { type: DataTypes.TEXT, allowNull: false },
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
  tableName: "CateringRequests",
});
