import "dotenv/config";
import { z } from "zod";

export const config = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  UNLOCK_ENCRYPTION_KEY: z.string().min(20),
  API_PORT: z.coerce.number().default(4000),
  PUBLIC_TRACKING_URL: z.string().url().default("http://localhost:5174/r"),
  WHATSAPP_PROVIDER: z.enum(["mock", "meta"]).default("mock"),
}).parse(process.env);
