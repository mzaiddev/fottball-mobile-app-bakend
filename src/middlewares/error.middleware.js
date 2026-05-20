const { StatusCodes } = require("http-status-codes");
const ApiError = require("../utils/ApiError");

function notFound(req, res, next) {
  next(new ApiError(StatusCodes.NOT_FOUND, `Route not found: ${req.originalUrl}`));
}

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;

  if (process.env.NODE_ENV !== "test") {
    console.error(err);
  }

  res.status(statusCode).json({
    success: false,
    message: err.message || "Something went wrong",
    details: err.details || null,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined
  });
}

module.exports = { notFound, errorHandler };
