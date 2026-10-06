const express = require("express");

const { getStockSummary } = require("../controllers/stockSummaryController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.get("/", getStockSummary);

module.exports = router;