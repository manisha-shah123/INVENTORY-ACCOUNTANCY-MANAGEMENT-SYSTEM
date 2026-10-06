const express = require("express");

const {
  getBalanceSheet,
  getOpening,
  saveOpening,
  getEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  getEntryTypes,
} = require("../controllers/balanceSheetController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(protect);

router.get("/", getBalanceSheet);

router.get("/opening", getOpening);
router.put("/opening", saveOpening);

router.get("/entry-types", getEntryTypes);
router.get("/entries", getEntries);
router.post("/entries", createEntry);
router.put("/entries/:id", updateEntry);
router.delete("/entries/:id", deleteEntry);

module.exports = router;