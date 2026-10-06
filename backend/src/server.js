require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const dns = require("dns");

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const clientRoutes = require("./routes/clientRoutes");
const brandRoutes = require("./routes/brandRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const gradeRoutes = require("./routes/gradeRoutes");
const sizeRoutes = require("./routes/sizeRoutes");
const hsCodeRoutes = require("./routes/hsCodeRoutes");
const productRoutes = require("./routes/productRoutes");
const purchaseRoutes = require("./routes/purchaseRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const receiptRoutes = require("./routes/receiptRoutes");
const expenseRoutes = require("./routes/expenseRoutes");
const stockSummaryRoutes = require("./routes/Stocksummaryroutes.js");
const balanceSheetRoutes = require("./routes/balanceSheetRoutes");

const app = express();

// Required when running behind a reverse proxy / load balancer (Render, Heroku,
// Nginx, etc.) so rate limiting sees the real client IP instead of the proxy's.
if (process.env.TRUST_PROXY) {
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
}

app.disable("x-powered-by");
app.use(helmet());

// Only the origins listed in CORS_ORIGINS (comma separated) may call the API
// from a browser. Defaults to the Vite dev server for local development.
const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Non-browser clients (curl, server-to-server) send no Origin header.
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin not allowed by CORS"));
    },
  }),
);

app.use(express.json({ limit: "1mb" }));

// General limiter for the whole API.
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 1000,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { success: false, message: "Too many requests, please try again later." },
  }),
);

// Much stricter limiter on login/register to slow down password guessing.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts, please try again in 15 minutes." },
});
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

app.use("/api/clients", clientRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/grades", gradeRoutes);
app.use("/api/sizes", sizeRoutes);
app.use("/api/hscodes", hsCodeRoutes);
app.use("/api/products", productRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/receipts", receiptRoutes);
app.use("/api/expenses", expenseRoutes);
app.use("/api/stock-summary", stockSummaryRoutes);
app.use("/api/balance-sheet", balanceSheetRoutes);

app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Inventory Management API is running",
  });
});

// Keep CORS rejections (and any other uncaught error) from leaking stack traces.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.message === "Origin not allowed by CORS") {
    return res.status(403).json({ success: false, message: err.message });
  }
  console.error(err.message);
  res.status(err.status || 500).json({ success: false, message: "Server error" });
});

connectDB();

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});