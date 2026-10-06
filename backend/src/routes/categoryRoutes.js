const makeAttributeRouter = require("../utils/attributeRouter");
const Category = require("../models/Category");

module.exports = makeAttributeRouter(Category, "Category");
