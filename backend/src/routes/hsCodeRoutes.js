const makeAttributeRouter = require("../utils/attributeRouter");
const HsCode = require("../models/HsCode");

module.exports = makeAttributeRouter(HsCode, "HS Code");