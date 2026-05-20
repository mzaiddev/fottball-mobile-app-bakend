const compression = require("compression");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const swaggerUi = require("swagger-ui-express");
const openApiSpec = require("./docs/openapi");
const postmanCollection = require("./docs/postman.collection.json");
const routes = require("./routes");
const { ensureDbConnected } = require("./config/db");
const { errorHandler, notFound } = require("./middlewares/error.middleware");

const app = express();
app.set("trust proxy", 1);

const openCors = cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Origin", "X-Requested-With", "Content-Type", "Accept", "Authorization"],
  optionsSuccessStatus: 204,
});

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    req.headers["access-control-request-headers"] || "Origin,X-Requested-With,Content-Type,Accept,Authorization",
  );
  res.header("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  return next();
});
app.use(openCors);
app.get("/api-docs.json", (req, res) => {
  res.json(openApiSpec);
});
app.get("/postman-collection.json", (req, res) => {
  res.json(postmanCollection);
});
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, {
    explorer: true,
    customSiteTitle: "Project Baller API Docs",
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true
    }
  }),
);
app.use(helmet());
app.use(compression());
app.use(cookieParser());
app.use(morgan("dev"));
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
  }),
);

app.use(
  "/api/integrations/webhooks/stripe",
  express.raw({ type: "application/json" }),
);
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Project Baller backend is running",
  });
});

app.use("/api", ensureDbConnected, routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
