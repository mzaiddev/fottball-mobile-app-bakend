const mongoose = require("mongoose");
const { StatusCodes } = require("http-status-codes");
const ApiError = require("../utils/ApiError");

function validateObjectId(paramName = "id") {
  return function objectIdValidator(req, res, next) {
    if (!mongoose.Types.ObjectId.isValid(req.params[paramName])) {
      return next(new ApiError(StatusCodes.BAD_REQUEST, `Invalid id: ${paramName}`));
    }
    next();
  };
}

module.exports = validateObjectId;
