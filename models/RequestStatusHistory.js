import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";

export const RequestStatusHistory = sequelize.define("RequestStatusHistory", {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  request_type: { type: DataTypes.ENUM("catering", "delivery"), allowNull: false },
  catering_request_id: { type: DataTypes.INTEGER, allowNull: true },
  delivery_request_id: { type: DataTypes.INTEGER, allowNull: true },
  previous_status: {
    type: DataTypes.ENUM("pending", "approved", "rejected", "completed", "cancelled"),
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM("pending", "approved", "rejected", "completed", "cancelled"),
    allowNull: false,
  },
  changed_by: { type: DataTypes.INTEGER, allowNull: false },
  reason: { type: DataTypes.TEXT, allowNull: true },
}, {
  tableName: "RequestStatusHistories",
  validate: {
    exactlyOneRequest() {
      const hasCateringRequest = this.catering_request_id !== null && this.catering_request_id !== undefined;
      const hasDeliveryRequest = this.delivery_request_id !== null && this.delivery_request_id !== undefined;
      if (hasCateringRequest === hasDeliveryRequest) {
        throw new Error("A status history entry must belong to exactly one service request.");
      }
      if (this.request_type === "catering" && !hasCateringRequest) {
        throw new Error("Catering history must reference a catering request.");
      }
      if (this.request_type === "delivery" && !hasDeliveryRequest) {
        throw new Error("Delivery history must reference a delivery request.");
      }
    },
  },
});
