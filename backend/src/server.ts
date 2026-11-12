import Fastify from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { Pool } from "pg";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  DATABASE_URL: z.string().url(),
  DATABASE_SSL: z.enum(["disable", "require"]).default("require"),
  RATE_LIMIT_MAX: z.coerce.number().int().min(10).max(1000).default(120),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // Do not print environment values: DATABASE_URL may contain credentials.
  console.error("Invalid control-plane environment configuration.");
  process.exit(1);
}
const env = parsed.data;

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL === "require" ? { rejectUnauthorized: true } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

const app = Fastify({
  logger: {
    level: env.NODE_ENV === "production" ? "info" : "debug",
    redact: ["req.headers.authorization", "req.headers.cookie"],
  },
  bodyLimit: 16 * 1024,
  requestTimeout: 10_000,
});

await app.register(helmet);
await app.register(rateLimit, {
  max: env.RATE_LIMIT_MAX,
  timeWindow: "1 minute",
  hook: "onRequest",
});

app.get("/v1/health", async (_request, reply) => {
  try {
    await pool.query("SELECT 1");
    return { status: "ok", database: "ready" };
  } catch {
    return reply.code(503).send({ status: "degraded", database: "unavailable" });
  }
});

app.get("/v1/servers", async (_request, reply) => {
  try {
    const result = await pool.query<{
      id: string;
      code: string;
      display_name: string;
      country_code: string;
      city: string;
      endpoint_host: string;
      endpoint_port: number;
      public_key: string;
      active_peers: number;
      capacity_peers: number;
    }>(
      `SELECT id, code, display_name, country_code, city, endpoint_host,
              endpoint_port, public_key, active_peers, capacity_peers
         FROM gateways
        WHERE status = 'online' AND active_peers < capacity_peers
        ORDER BY country_code ASC,
                 (active_peers::numeric / capacity_peers::numeric) ASC,
                 display_name ASC`,
    );

    return {
      servers: result.rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.display_name,
        countryCode: row.country_code,
        city: row.city,
        endpoint: `${row.endpoint_host}:${row.endpoint_port}`,
        publicKey: row.public_key,
        loadPercent: Math.min(100, Math.round((row.active_peers / row.capacity_peers) * 100)),
      })),
    };
  } catch (error) {
    requestLogError(error);
    return reply.code(503).send({ error: "SERVER_CATALOG_UNAVAILABLE" });
  }
});

function requestLogError(error: unknown) {
  // Database error messages can include internal details; log only a stable code/name.
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "UNKNOWN";
  app.log.error({ databaseErrorCode: code }, "Server catalog query failed");
}

app.setNotFoundHandler((_request, reply) => {
  return reply.code(404).send({ error: "NOT_FOUND" });
});

app.setErrorHandler((error, _request, reply) => {
  if (error.statusCode === 429) {
    return reply.code(429).send({ error: "RATE_LIMITED" });
  }
  app.log.error({ errorCode: error.code ?? "UNKNOWN" }, "Unhandled request error");
  return reply.code(500).send({ error: "INTERNAL_ERROR" });
});

const close = async () => {
  await app.close();
  await pool.end();
};
process.once("SIGINT", () => void close().then(() => process.exit(0)));
process.once("SIGTERM", () => void close().then(() => process.exit(0)));

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  app.log.error({ errorCode: error instanceof Error ? error.name : "UNKNOWN" }, "Could not start control plane");
  await close();
  process.exit(1);
}
