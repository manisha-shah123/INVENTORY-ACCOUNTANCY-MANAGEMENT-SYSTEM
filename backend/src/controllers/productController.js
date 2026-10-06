const Product = require("../models/Product");
const StockMovement = require("../models/StockMovement");

const getProducts = async (req, res) => {
  try {
    const { search } = req.query;
    const filter = {};

    if (search) {
      const regex = new RegExp(search.trim(), "i");
      filter.$or = [
        { name: regex },
        { sku: regex },
        { category: regex },
        { brand: regex },
      ];
    }

    const products = await Product.find(filter).sort({ name: 1 });

    res.status(200).json({ success: true, data: products });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch products" });
  }
};

const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    res.status(200).json({ success: true, data: product });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch product" });
  }
};

const createProduct = async (req, res) => {
  try {
    const {
      name,
      sku,
      brand,
      category,
      hsCode,
      unit,
      purchasePrice,
      sellingPrice,
      minimumStock,
      openingStock,
    } = req.body;

    if (!name || !name.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Product name is required" });
    }
    if (!sku || !sku.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "SKU is required" });
    }

    const purchasePriceNum = Number(purchasePrice);
    const sellingPriceNum = Number(sellingPrice);

    if (sellingPriceNum < purchasePriceNum) {
      return res.status(400).json({
        success: false,
        message: `Selling price cannot be less than purchase price (${purchasePriceNum}).`,
      });
    }

    const startingStock = Number(openingStock) > 0 ? Number(openingStock) : 0;

    const product = await Product.create({
      name: name.trim(),
      sku: sku.trim(),
      brand,
      category,
      hsCode,
      unit,
      purchasePrice: purchasePriceNum,
      sellingPrice: sellingPriceNum,
      minimumStock,
      currentStock: startingStock,
    });

    if (startingStock > 0) {
      await StockMovement.create({
        product: product._id,
        type: "in",
        quantity: startingStock,
        reason: "Opening stock",
        source: "opening",
        balanceAfter: startingStock,
      });
    }

    res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: product,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const message =
        Object.values(error.errors)[0]?.message || "Validation failed";
      return res.status(400).json({ success: false, message });
    }
    if (error.code === 11000) {
      return res
        .status(400)
        .json({
          success: false,
          message: "A product with this SKU already exists",
        });
    }
    res
      .status(500)
      .json({ success: false, message: "Failed to create product" });
  }
};

const updateProduct = async (req, res) => {
  try {
    const {
      name,
      sku,
      brand,
      category,
      hsCode,
      unit,
      purchasePrice,
      sellingPrice,
      minimumStock,
    } = req.body;

    const purchasePriceNum = Number(purchasePrice);
    const sellingPriceNum = Number(sellingPrice);

    if (sellingPriceNum < purchasePriceNum) {
      return res.status(400).json({
        success: false,
        message: `Selling price cannot be less than purchase price (${purchasePriceNum}).`,
      });
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      {
        name,
        sku,
        brand,
        category,
        hsCode,
        unit,
        purchasePrice: purchasePriceNum,
        sellingPrice: sellingPriceNum,
        minimumStock,
      },
      { new: true, runValidators: true },
    );

    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: product,
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const message =
        Object.values(error.errors)[0]?.message || "Validation failed";
      return res.status(400).json({ success: false, message });
    }
    if (error.code === 11000) {
      return res
        .status(400)
        .json({
          success: false,
          message: "A product with this SKU already exists",
        });
    }
    res
      .status(500)
      .json({ success: false, message: "Failed to update product" });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    await StockMovement.deleteMany({ product: product._id });

    res
      .status(200)
      .json({ success: true, message: "Product deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to delete product" });
  }
};

const adjustStock = async (req, res) => {
  try {
    const { type, quantity, reason } = req.body;

    if (type !== "out") {
  return res.status(400).json({
    success: false,
    message:
      "Stock In must be recorded as a Purchase so there is a purchase record for it. Please use the Purchases section to stock in.",
  });
}

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Quantity must be a whole number greater than 0",
        });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res
        .status(404)
        .json({ success: false, message: "Product not found" });
    }

    if (type === "out" && qty > product.currentStock) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock. Only ${product.currentStock} ${product.unit} available.`,
      });
    }

    const newStock =
      type === "in" ? product.currentStock + qty : product.currentStock - qty;

    product.currentStock = newStock;
    await product.save();

    const movement = await StockMovement.create({
      product: product._id,
      type,
      quantity: qty,
      reason: reason || "",
      source: "adjustment",
      balanceAfter: newStock,
    });

    res.status(200).json({
      success: true,
      message: "Stock updated successfully",
      data: { product, movement },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to adjust stock" });
  }
};

const getStockHistory = async (req, res) => {
  try {
    const movements = await StockMovement.find({ product: req.params.id }).sort(
      { createdAt: -1 },
    );

    res.status(200).json({ success: true, data: movements });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch stock history" });
  }
};

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  adjustStock,
  getStockHistory,
};