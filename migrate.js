import { Sequelize } from "sequelize";
import bcrypt from "bcrypt";
import { sequelize } from "./models/db.js";
import { User } from "./models/userModel.js";
import "./models/associations.js";

const database = process.env.DB_NAME || "ServeSync_E-Commerce_Atienza";
const host = process.env.DB_HOST || "localhost";
const port = Number(process.env.DB_PORT || 3306);
const username = process.env.DB_USER || "root";
const password = process.env.DB_PASSWORD || "";

const rootSequelize = new Sequelize({
  dialect: "mysql",
  host,
  port,
  username,
  password,
  logging: false,
});

const quotedDatabase = `\`${database.replace(/`/g, "``")}\``;

try {
  if (process.env.DB_CREATE !== "false") {
    await rootSequelize.query(`CREATE DATABASE IF NOT EXISTS ${quotedDatabase}`);
    console.log(`✅ Database is available: ${database}`);
  }

  await rootSequelize.close();
  await sequelize.authenticate();
  console.log("✅ Connected to MySQL database!");
  await sequelize.sync({ alter: true });
  console.log("✅ Database schema synchronized without dropping tables or records.");

  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    const [admin, created] = await User.findOrCreate({
      where: { email: process.env.ADMIN_EMAIL },
      defaults: {
        full_name: process.env.ADMIN_NAME || "System Administrator",
        email: process.env.ADMIN_EMAIL,
        password: hashedPassword,
        role: "admin",
        status: "active",
      },
    });

    if (created) {
      console.log(`✅ Administrator created: ${admin.email}`);
    } else {
      console.log(`ℹ️ Administrator already exists: ${admin.email}`);
    }
  }
} catch (err) {
  console.error("❌ Migration failed:", err.message);
  process.exitCode = 1;
} finally {
  await sequelize.close();
  if (!rootSequelize.options.replication) {
    await rootSequelize.close().catch(() => {});
  }
}
