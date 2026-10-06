const mongoose = require("mongoose");
const { getCurrentCompanyId } = require("../utils/tenantContext");


const QUERY_HOOKS = [
  "find",
  "findOne",
  "findOneAndUpdate",
  "findOneAndDelete",
  "findOneAndRemove",
  "countDocuments",
  "updateOne",
  "updateMany",
  "deleteOne",
  "deleteMany",
  "distinct",
];


function companyScope(schema) {
  schema.add({
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
  });

  schema.pre("validate", function (next) {
    if (this.isNew && !this.company) {
      const companyId = getCurrentCompanyId();
      if (!companyId) {
        return next(
          new Error(
            "No company context available — this operation must run inside an authenticated request.",
          ),
        );
      }
      this.company = companyId;
    }
    next();
  });

  // Auto-fill `company` for bulk inserts.
  schema.pre("insertMany", function (next, docs) {
    const companyId = getCurrentCompanyId();
    if (companyId && Array.isArray(docs)) {
      docs.forEach((doc) => {
        if (!doc.company) doc.company = companyId;
      });
    }
    next();
  });


  QUERY_HOOKS.forEach((hook) => {
    schema.pre(hook, function (next) {
      
      if (this.getOptions().skipTenantScope) return next();

      const companyId = getCurrentCompanyId();
      if (companyId) {
        this.where({ company: companyId });
      }
      next();
    });
  });
}

module.exports = companyScope;
