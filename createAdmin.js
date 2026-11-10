import bcrypt from "bcrypt";
import { User } from "./models/userModel.js";

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const fullName = process.env.ADMIN_NAME || "System Administrator";

if (!email || !password) {
  console.error("ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required.");
  process.exit(1);
}

if (password.length < 12) {
  console.error("ADMIN_PASSWORD must be at least 12 characters long.");
  process.exit(1);
}

try {
  const { sequelize } = await import("./models/db.js");
  await sequelize.authenticate();

  const existingAdmin = await User.findOne({ where: { email } });
  if (existingAdmin) {
    console.log(`Administrator already exists: ${email}`);
    await sequelize.close();
    process.exit(0);
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  await User.create({
    full_name: fullName,
    email,
    password: hashedPassword,
    role: "admin",
    status: "active",
  });

  console.log(`Administrator created: ${email}`);
  await sequelize.close();
} catch (error) {
  console.error("Administrator creation failed:", error.message);
  process.exitCode = 1;
}