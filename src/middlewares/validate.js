const { StatusCodes } = require("http-status-codes");
const ApiError = require("../utils/ApiError");

function validateValue(key, value, rule) {
  if (value === undefined || value === null || value === "") {
    if (rule.required) throw new ApiError(StatusCodes.BAD_REQUEST, `${key} is required`);
    return undefined;
  }

  if (rule.type === "string") {
    const text = String(value).trim();
    if (rule.min && text.length < rule.min) throw new ApiError(StatusCodes.BAD_REQUEST, `${key} is too short`);
    if (rule.max && text.length > rule.max) throw new ApiError(StatusCodes.BAD_REQUEST, `${key} is too long`);
    if (rule.enum && !rule.enum.includes(text)) throw new ApiError(StatusCodes.BAD_REQUEST, `${key} is invalid`);
    return text;
  }

  if (rule.type === "number") {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new ApiError(StatusCodes.BAD_REQUEST, `${key} must be a number`);
    if (rule.min !== undefined && number < rule.min) throw new ApiError(StatusCodes.BAD_REQUEST, `${key} is too small`);
    if (rule.max !== undefined && number > rule.max) throw new ApiError(StatusCodes.BAD_REQUEST, `${key} is too large`);
    return number;
  }

  if (rule.type === "boolean") {
    if (typeof value === "boolean") return value;
    if (["true", "1", "yes", "on"].includes(String(value).toLowerCase())) return true;
    if (["false", "0", "no", "off"].includes(String(value).toLowerCase())) return false;
    throw new ApiError(StatusCodes.BAD_REQUEST, `${key} must be true or false`);
  }

  if (rule.type === "array") {
    if (!Array.isArray(value)) throw new ApiError(StatusCodes.BAD_REQUEST, `${key} must be an array`);
    if (rule.max && value.length > rule.max) throw new ApiError(StatusCodes.BAD_REQUEST, `${key} has too many items`);
    return value;
  }

  if (rule.type === "object") {
    if (typeof value !== "object" || Array.isArray(value)) {
      throw new ApiError(StatusCodes.BAD_REQUEST, `${key} must be an object`);
    }
    return value;
  }

  return value;
}

function validateBody(schema, { stripUnknown = true } = {}) {
  return (req, res, next) => {
    const cleaned = {};
    const source = req.body || {};

    try {
      for (const [key, rule] of Object.entries(schema)) {
        const value = validateValue(key, source[key], rule);
        if (value !== undefined) cleaned[key] = value;
      }
    } catch (error) {
      return next(error);
    }

    req.body = stripUnknown ? cleaned : { ...source, ...cleaned };
    return next();
  };
}

module.exports = { validateBody };
