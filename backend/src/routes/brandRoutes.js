const makeAttributeRouter = require("../utils/attributeRouter");
const Brand = require("../models/Brand");

module.exports = makeAttributeRouter(Brand, "Brand");
