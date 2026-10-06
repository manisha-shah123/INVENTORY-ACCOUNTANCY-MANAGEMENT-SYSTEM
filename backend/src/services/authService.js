const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const Admin = require("../models/Admin");
const Company = require("../models/Company");

const signToken = (admin, companyId) =>
  jwt.sign(
    {
      id: admin._id,
      email: admin.email,
      companyId: companyId.toString(),
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" },
  );

/**
 * Creates a brand-new company together with its first (and, for now, only)
 * admin account. This is the self-service signup flow.
 */
const registerCompany = async (companyName, email, password) => {
  const normalizedEmail = email.trim().toLowerCase();

  const existingAdmin = await Admin.findOne({ email: normalizedEmail });
  if (existingAdmin) {
    throw new Error("An account with this email already exists");
  }

  const company = await Company.create({ name: companyName.trim() });

  const hashedPassword = await bcrypt.hash(password, 10);

  const admin = await Admin.create({
    email: normalizedEmail,
    password: hashedPassword,
    company: company._id,
  });

  const token = signToken(admin, company._id);

  return {
    token,
    admin: {
      id: admin._id,
      email: admin.email,
      companyId: company._id,
      companyName: company.name,
    },
  };
};

const loginAdmin = async (email, password) => {
  const normalizedEmail = email.trim().toLowerCase();

  const admin = await Admin.findOne({ email: normalizedEmail }).populate(
    "company",
    "name",
  );

  if (!admin) {
    throw new Error("Invalid email or password");
  }

  const isPasswordValid = await bcrypt.compare(password, admin.password);

  if (!isPasswordValid) {
    throw new Error("Invalid email or password");
  }

  const token = signToken(admin, admin.company._id);

  return {
    token,
    admin: {
      id: admin._id,
      email: admin.email,
      companyId: admin.company._id,
      companyName: admin.company.name,
    },
  };
};

module.exports = {
  registerCompany,
  loginAdmin,
};
