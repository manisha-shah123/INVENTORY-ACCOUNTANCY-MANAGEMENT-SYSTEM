const mongoose = require("mongoose");
const companyScope = require("../plugins/companyScope");

const schema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      // NOTE: no unique:true here — names only need to be unique per company (see index below)
    },
  },
  { timestamps: true },
);

schema.index({ company: 1, name: 1 }, { unique: true });

schema.plugin(companyScope);

module.exports = mongoose.model("Category", schema);
