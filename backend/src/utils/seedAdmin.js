require("dotenv").config();

const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const bcrypt = require("bcryptjs");
const connectDB = require("../config/db");
const Admin = require("../models/Admin");
const Company = require("../models/Company");

const seedAdmin = async () => {
  try {
    await connectDB();

    const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const password = String(process.env.ADMIN_PASSWORD || "");
    const companyName = String(
      process.env.ADMIN_COMPANY_NAME || process.env.COMPANY_NAME || "Default Company",
    ).trim();

    if (!email || !password) {
      throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env");
    }

    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      console.log("Admin already exists.");
      process.exit(0);
    }

    const company = await Company.create({ name: companyName });
    const hashedPassword = await bcrypt.hash(password, 10);

    await Admin.create({
      email,
      password: hashedPassword,
      company: company._id,
    });

    console.log(`Admin created successfully for company: ${company.name}`);
    process.exit(0);
  } catch (error) {
    console.error("Admin creation failed:", error.message);
    process.exit(1);
  }
};

seedAdmin();
