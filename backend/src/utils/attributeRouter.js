const express = require("express");
const { protect } = require("../middleware/authMiddleware");

const makeAttributeRouter = (Model, label) => {
  const router = express.Router();
  router.use(protect);

  router.get("/", async (req, res) => {
    try {
      const items = await Model.find().sort({ name: 1 });
      res.status(200).json({ success: true, data: items });
    } catch (error) {
      res
        .status(500)
        .json({
          success: false,
          message: `Failed to fetch ${label.toLowerCase()}s`,
        });
    }
  });

  router.post("/", async (req, res) => {
    try {
      const { name } = req.body;
      if (!name || !name.trim()) {
        return res
          .status(400)
          .json({ success: false, message: `${label} name is required` });
      }
      const item = await Model.create({ name: name.trim() });
      res
        .status(201)
        .json({
          success: true,
          message: `${label} added successfully`,
          data: item,
        });
    } catch (error) {
      if (error.code === 11000) {
        return res
          .status(400)
          .json({
            success: false,
            message: `This ${label.toLowerCase()} already exists`,
          });
      }
      res
        .status(500)
        .json({
          success: false,
          message: `Failed to add ${label.toLowerCase()}`,
        });
    }
  });

  router.put("/:id", async (req, res) => {
    try {
      const { name } = req.body;
      if (!name || !name.trim()) {
        return res
          .status(400)
          .json({ success: false, message: `${label} name is required` });
      }
      const item = await Model.findByIdAndUpdate(
        req.params.id,
        { name: name.trim() },
        { new: true, runValidators: true },
      );
      if (!item)
        return res
          .status(404)
          .json({ success: false, message: `${label} not found` });
      res
        .status(200)
        .json({
          success: true,
          message: `${label} updated successfully`,
          data: item,
        });
    } catch (error) {
      if (error.code === 11000) {
        return res
          .status(400)
          .json({
            success: false,
            message: `This ${label.toLowerCase()} already exists`,
          });
      }
      res
        .status(500)
        .json({
          success: false,
          message: `Failed to update ${label.toLowerCase()}`,
        });
    }
  });

  router.delete("/:id", async (req, res) => {
    try {
      const item = await Model.findByIdAndDelete(req.params.id);
      if (!item)
        return res
          .status(404)
          .json({ success: false, message: `${label} not found` });
      res
        .status(200)
        .json({ success: true, message: `${label} deleted successfully` });
    } catch (error) {
      res
        .status(500)
        .json({
          success: false,
          message: `Failed to delete ${label.toLowerCase()}`,
        });
    }
  });

  return router;
};

module.exports = makeAttributeRouter;
