const compression = require("compression");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const swaggerUi = require("swagger-ui-express");
const openApiSpec = require("./docs/openapi");
const routes = require("./routes");
const { errorHandler, notFound } = require("./middlewares/error.middleware");

const app = express();
app.set("trust proxy", 1);

app.use(cors());
app.get("/api-docs.json", (req, res) => {
  res.json(openApiSpec);
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

app.use("/api", routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
