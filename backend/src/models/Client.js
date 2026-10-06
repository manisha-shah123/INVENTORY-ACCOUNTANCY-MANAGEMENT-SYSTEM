const mongoose = require("mongoose");
const companyScope = require("../plugins/companyScope");

const clientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      validate: {
        validator: function (value) {
          return /[A-Za-z]/.test(value);
        },
        message: "Name must contain letters, not just numbers",
      },
    },

    type: {
      type: String,
      enum: ["customer", "supplier"],
      required: [true, "Client type is required"],
    },

    customerCategory: {
      type: String,
      enum: ["distributor", "wholesaler", "retailer", "normal"],
      default: "normal",
    },

    country: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },

    phone: {
      type: String,
      trim: true,
      default: "",
      validate: {
        validator: function (value) {
          if (!value) return true;
          return /^\d{10}$/.test(value);
        },
        message: "Phone number must be exactly 10 digits",
      },
    },

    vatNumber: {
      type: String,
      trim: true,
      default: "",
      validate: {
        validator: function (value) {
          if (!value) return true;
          return /^\d{9}$/.test(value);
        },
        message: "VAT number must be exactly 9 digits",
      },
    },

    openingDue: {
      type: Number,
      default: 0,
      min: [0, "Opening due cannot be negative"],
    },
  },
  { timestamps: true },
);

clientSchema.index({ company: 1, type: 1, name: 1 });
clientSchema.index({ company: 1, type: 1, city: 1 });

clientSchema.plugin(companyScope);

const Client = mongoose.model("Client", clientSchema);

module.exports = Client;
