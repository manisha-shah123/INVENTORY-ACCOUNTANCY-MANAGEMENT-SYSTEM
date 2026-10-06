const express = require("express");

const {
  getPurchases,
  getPurchaseById,
  createPurchase,
  updatePurchaseDetails,
  createPurchaseReturn,
  deletePurchase,
} = require("../controllers/purchaseController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.get("/", getPurchases);
router.get("/:id", getPurchaseById);
router.post("/", createPurchase);
router.put("/:id/details", updatePurchaseDetails);
router.post("/:id/return", createPurchaseReturn);
router.delete("/:id", deletePurchase);

module.exports = router;