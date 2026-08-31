import express, { Application, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { StatusCodes } from "http-status-codes";
import { Morgan } from "./shared/morgan";
import router from "./app/routes";
import globalErrorHandler from "./app/middlewares/globalErrorHandler";
import { globalRateLimiter } from "./app/middlewares/rateLimiter";
import config from "./config";
// import { StripeController } from './app/modules/stripe/stripe.controller';
import passport from "./config/passport";
import { StripeController } from "./app/modules/stripe/stripe.controller";
import swaggerUi from "swagger-ui-express";
import path from "node:path";
import fs from "node:fs";
import YAML from "yaml";

const app: Application = express();

// ─── Logger ───────────────────────────────────────────────────────────────────
app.use(Morgan.successHandler);
app.use(Morgan.errorHandler);

// ─── Rate Limiter ─────────────────────────────────────────────────────────────
app.use(globalRateLimiter);

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Updated to array to support multiple origins
app.use(
  cors({
    origin: [
      config.client_url as string,
      "http://localhost:3000",
      "http://localhost:5173",
      "http://10.10.7.98:3000",
      "http://10.10.26.188:5000"
    ].filter(Boolean),
    credentials: true,
  }),
);

// ─── Stripe Webhook ───────────────────────────────────────────────────────────
// MUST be before express.json() — Stripe needs raw body
app.post(
  '/webhook/stripe',
  express.raw({ type: 'application/json' }),
  StripeController.handleWebhook,
);

// ─── Parsers ──────────────────────────────────────────────────────────────────
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Passport ─────────────────────────────────────────────────────────────────
app.use(passport.initialize());

// ─── Static Files ─────────────────────────────────────────────────────────────
app.use("/api/v1/uploads", express.static("uploads"));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/", (_req: Request, res: Response) => {
  res.status(StatusCodes.OK).json({
    success: true,
    message: "Mynder API Server is running 🚀",
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/v1", router);

// --- Open API Docs ---
const openApiPath = path.join(process.cwd(), "openapi.yaml");
const openApiFile = fs.readFileSync(openApiPath, "utf8");
const openApiDocument = YAML.parse(openApiFile);

app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(openApiDocument)
);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req: Request, res: Response) => {
  res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    message: "Not Found",
    errorMessages: [{ path: req.originalUrl, message: "API Doesn't Exist" }],
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(globalErrorHandler);

export default app;
