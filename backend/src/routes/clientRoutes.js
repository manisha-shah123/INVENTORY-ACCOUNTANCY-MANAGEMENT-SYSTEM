const express = require("express");

const {
  getClients,
  getClientSummaryReport,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
} = require("../controllers/clientController");
const { getCustomerSummary } = require("../controllers/receiptController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.get("/", getClients);
router.get("/summary-report", getClientSummaryReport);
router.get("/:id/summary", getCustomerSummary);
router.get("/:id", getClientById);
router.post("/", createClient);
router.put("/:id", updateClient);
router.delete("/:id", deleteClient);

module.exports = router;
