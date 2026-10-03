import "dotenv/config";
import { z } from "zod";

const localOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "tauri://localhost",
].join(",");

const testDefaults = process.env.NODE_ENV === "test" ? {
  DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test",
  JWT_SECRET: "test-jwt-secret-with-at-least-32-characters",
  UNLOCK_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
} : {};

export const config = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  UNLOCK_ENCRYPTION_KEY: z.string().min(20),
  API_PORT: z.coerce.number().default(4000),
  PUBLIC_TRACKING_URL: z.string().url().default("http://localhost:5174/r"),
  WHATSAPP_PROVIDER: z.enum(["mock", "meta"]).default("mock"),
  META_WHATSAPP_ACCESS_TOKEN: z.string().default(""),
  META_WHATSAPP_PHONE_NUMBER_ID: z.string().default(""),
  META_WHATSAPP_VERIFY_TOKEN: z.string().default(""),
  META_WHATSAPP_APP_SECRET: z.string().default(""),
  META_WHATSAPP_GRAPH_VERSION: z.string().default("v22.0"),
  META_WHATSAPP_LANGUAGE_CODE: z.string().default("ar"),
  CORS_ORIGINS: z.string().default(localOrigins),
}).parse({ ...testDefaults, ...process.env });