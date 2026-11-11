/*
    MIT License
    
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    */
  // Firebase doesn't require predefined models.
  // Use Firestore directly in controllers or create helper functions here.
  // Collection name: "order"

  import { DataTypes } from "sequelize";
import { sequelize } from "./db.js";


export const Order = sequelize.define("order", {

  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  order_number: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  customer_id: { type: DataTypes.INTEGER, allowNull: false },
  order_type: { type: DataTypes.ENUM("pickup", "delivery"), allowNull: false, defaultValue: "pickup" },
  delivery_address: { type: DataTypes.STRING(500), allowNull: true },
  contact_number: { type: DataTypes.STRING(30), allowNull: true },
  subtotal: { type: DataTypes.DECIMAL(10,2), allowNull: false },
  total_amount: { type: DataTypes.DECIMAL(10,2), allowNull: false },
  status: { type: DataTypes.ENUM("pending", "approved", "preparing", "ready", "out_for_delivery", "completed", "rejected", "cancelled"), allowNull: false, defaultValue: "pending" },
  terms_accepted_at: { type: DataTypes.DATE, allowNull: false },
  notes: { type: DataTypes.TEXT, allowNull: true },
  reviewed_by: { type: DataTypes.INTEGER, allowNull: true },
  reviewed_at: { type: DataTypes.DATE, allowNull: true },
}, { tableName: "Orders" });

export { sequelize };