const { loginAdmin, registerCompany } = require("../services/authService");
const Company = require("../models/Company");

const register = async (req, res) => {
  try {
    const { companyName, email, password } = req.body;

    if (!companyName || !companyName.trim()) {
      return res.status(400).json({
        success: false,
        message: "Company name is required",
      });
    }
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const result = await registerCompany(companyName, email, password);

    res.status(201).json({
      success: true,
      message: "Company registered successfully",
      data: result,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "An account with this email already exists",
      });
    }
    res.status(400).json({
      success: false,
      message: error.message || "Registration failed",
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const result = await loginAdmin(email, password);

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: result,
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};

const getMe = async (req, res) => {
  // req.admin is set by the auth middleware after verifying the JWT. The token
  // only carries the company *id*, so look the name up as well — otherwise the
  // company name (sidebar, printed receipts) disappears after a page refresh.
  let companyName;
  try {
    const company = await Company.findById(req.admin.companyId).select("name");
    companyName = company?.name;
  } catch (error) {
    // fall through — the name is cosmetic, don't fail the whole session check
  }

  res.status(200).json({
    success: true,
    data: {
      admin: { ...req.admin, companyName },
    },
  });
};

module.exports = {
  register,
  login,
  getMe,
};
