const makeAttributeRouter = require("../utils/attributeRouter");
const Grade = require("../models/Grade");

module.exports = makeAttributeRouter(Grade, "Grade");
