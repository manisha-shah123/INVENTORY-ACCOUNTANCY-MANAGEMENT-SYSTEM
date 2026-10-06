const jwt = require("jsonwebtoken");
const { runWithCompany } = require("../utils/tenantContext");

const protect = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Not authorized, no token provided",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.companyId) {
      return res.status(401).json({
        success: false,
        message: "Not authorized, token missing company information",
      });
    }

    req.admin = decoded; // { id, email, companyId }

    // Everything downstream of this (route handlers, and anything they
    // await) now automatically resolves to this admin's company via
    // getCurrentCompanyId() — see src/plugins/companyScope.js.
    runWithCompany(decoded.companyId, next);
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Not authorized, token invalid or expired",
    });
  }
};

module.exports = { protect };
