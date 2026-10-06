const express = require("express");

const {
  getReceipts,
  getReceiptById,
  createReceipt,
  updateReceipt,
  deleteReceipt,
} = require("../controllers/receiptController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.get("/", getReceipts);
router.get("/:id", getReceiptById);
router.post("/", createReceipt);
router.put("/:id", updateReceipt);
router.delete("/:id", deleteReceipt);

module.exports = router;
