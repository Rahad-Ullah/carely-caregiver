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
    ].filter(Boolean),
    credentials: true,
  }),
);

// ─── Stripe Webhook ───────────────────────────────────────────────────────────
// MUST be before express.json() — Stripe needs raw body
// app.post(
//   '/api/v1/stripe/webhook',
//   express.raw({ type: 'application/json' }),
//   StripeController.handleWebhook,
// );

// ─── Parsers ──────────────────────────────────────────────────────────────────
app.use(cookieParser());
app.use((req, res, next) => {
  if (req.originalUrl.includes("/stripe/webhook")) {
    next();
  } else {
    express.json()(req, res, next);
  }
});
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
