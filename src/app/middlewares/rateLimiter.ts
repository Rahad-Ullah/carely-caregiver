
import rateLimit from "express-rate-limit";
import config from "../../config";
export const globalRateLimiter = rateLimit({
  windowMs: Number(config.rate_limit.in_minutes || 15) * 60 * 1000, // 15 minutes
  max: Number(config.rate_limit.limit || 500), // limit each IP to 200 requests per windowMs
  message: {
    success: false,
    message: "Too many requests, please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
