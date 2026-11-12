import { createHash, createHmac, pbkdf2 as pbkdf2Callback, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import Fastify, { type FastifyRequest } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";

const pbkdf2 = promisify(pbkdf2Callback);
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  DATABASE_URL: z.string().url(),
  DATABASE_SSL: z.enum(["disable", "require"]).default("require"),
  RATE_LIMIT_MAX: z.coerce.number().int().min(10).max(1000).default(120),
  ACCESS_TOKEN_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
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
  logger: { level: env.NODE_ENV === "production" ? "info" : "debug",
    redact: ["req.headers.authorization", "req.headers.cookie", "req.body.password", "req.body.refreshToken"] },
  bodyLimit: 16 * 1024,
  requestTimeout: 10_000,
});
await app.register(helmet);
await app.register(rateLimit, { max: env.RATE_LIMIT_MAX, timeWindow: "1 minute", hook: "onRequest" });

type AccessClaims = { sub: string; email: string; iat: number; exp: number; iss: "nexa-vpn" };
type AccountRow = { id: string; email: string; password_hash: string | null; status: string };
const emailSchema = z.string().trim().email().max(254).transform((v) => v.toLowerCase());
const passwordSchema = z.string().min(12).max(128);
const registerSchema = z.object({ email: emailSchema, password: passwordSchema, countryCode: z.string().regex(/^[A-Za-z]{2}$/).optional() });
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });
const refreshSchema = z.object({ refreshToken: z.string().min(40).max(200) });
const deviceCreateSchema = z.object({
  platform: z.enum(["android", "ios"]),
  label: z.string().trim().min(1).max(80).optional(),
  publicKey: z.string().length(44).regex(/^[A-Za-z0-9+/]{43}=$/),
});
function isWireGuardPublicKey(value: string): boolean {
  try {
    const decoded = Buffer.from(value, "base64");
    return decoded.length === 32 && decoded.toString("base64") === value;
  } catch { return false; }
}

function b64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}
function signAccessToken(account: { id: string; email: string }): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload: AccessClaims = { sub: account.id, email: account.email, iat: now,
    exp: now + env.ACCESS_TOKEN_TTL_SECONDS, iss: "nexa-vpn" };
  const body = b64url(JSON.stringify(payload));
  const input = header + "." + body;
  const signature = createHmac("sha256", env.ACCESS_TOKEN_SECRET).update(input).digest("base64url");
  return input + "." + signature;
}
function verifyAccessToken(token: string): AccessClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const input = parts[0] + "." + parts[1];
  const expected = createHmac("sha256", env.ACCESS_TOKEN_SECRET).update(input).digest();
  let supplied: Buffer;
  try { supplied = Buffer.from(parts[2], "base64url"); } catch { return null; }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as AccessClaims;
    if (claims.iss !== "nexa-vpn" || typeof claims.sub !== "string" ||
        typeof claims.email !== "string" || !Number.isInteger(claims.exp) ||
        claims.exp <= Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch { return null; }
}
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await pbkdf2(password, salt, 310_000, 64, "sha512") as Buffer;
  return "pbkdf2-sha512$310000$" + salt.toString("base64url") + "$" + derived.toString("base64url");
}
async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, iterationsText, saltText, hashText] = stored.split("$");
  const iterations = Number(iterationsText);
  if (algorithm !== "pbkdf2-sha512" || !Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000 || !saltText || !hashText) return false;
  try {
    const expected = Buffer.from(hashText, "base64url");
    const actual = await pbkdf2(password, Buffer.from(saltText, "base64url"), iterations, expected.length, "sha512") as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch { return false; }
}
function newRefreshToken(): string { return randomBytes(48).toString("base64url"); }
function tokenHash(token: string): string { return createHash("sha256").update(token).digest("hex"); }
function refreshExpiry(): Date { return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000); }

async function issueSession(client: PoolClient, account: { id: string; email: string }, familyId?: string) {
  const refreshToken = newRefreshToken();
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO auth_sessions(account_id, family_id, refresh_token_hash, expires_at)
     VALUES ($1, COALESCE($2::uuid, gen_random_uuid()), $3, $4) RETURNING id`,
    [account.id, familyId ?? null, tokenHash(refreshToken), refreshExpiry()],
  );
  return { accessToken: signAccessToken(account), refreshToken, tokenType: "Bearer",
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS, sessionId: inserted.rows[0].id };
}
async function authenticate(request: FastifyRequest): Promise<AccessClaims | null> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return verifyAccessToken(header.slice(7));
}


function gatewayAgentAuthenticated(request: FastifyRequest, gatewayId: string): Promise<boolean> {
  const supplied = request.headers["x-nexa-agent-token"];
  if (typeof supplied !== "string" || supplied.length < 32 || supplied.length > 256) return Promise.resolve(false);
  const suppliedHash = createHash("sha256").update(supplied).digest();
  return pool.query<{ agent_token_hash: string }>(
    "SELECT agent_token_hash FROM gateways WHERE id = $1 AND agent_token_hash IS NOT NULL",
    [gatewayId],
  ).then((result) => {
    const stored = result.rows[0]?.agent_token_hash;
    if (!stored || !/^[a-f0-9]{64}$/i.test(stored)) return false;
    const expected = Buffer.from(stored, "hex");
    return expected.length === suppliedHash.length && timingSafeEqual(expected, suppliedHash);
  });
}

app.post("/v1/gateway-agent/jobs/claim", async (request, reply) => {
  const parsedBody = z.object({ gatewayId: z.string().uuid() }).safeParse(request.body);
  if (!parsedBody.success) return reply.code(400).send({ error: "INVALID_GATEWAY" });
  const gatewayId = parsedBody.data.gatewayId;
  if (!await gatewayAgentAuthenticated(request, gatewayId)) return reply.code(401).send({ error: "AGENT_UNAUTHORIZED" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const gateway = await client.query(
      "UPDATE gateways SET agent_last_seen_at = now() WHERE id = $1 AND status IN ('online','degraded') RETURNING id",
      [gatewayId],
    );
    if (!gateway.rowCount) {
      await client.query("ROLLBACK");
      return reply.code(404).send({ error: "GATEWAY_NOT_AVAILABLE" });
    }
    const claimed = await client.query<{
      id: string; action: string; device_id: string; public_key: string; assigned_ipv4: string | null;
    }>(
      `WITH candidate AS (
         SELECT j.id FROM gateway_jobs j
          WHERE j.gateway_id = $1
            AND (j.status = 'queued' OR (j.status = 'leased' AND j.lease_expires_at < now()))
            AND j.available_at <= now()
          ORDER BY CASE j.action WHEN 'revoke_peer' THEN 0 ELSE 1 END, j.created_at
          FOR UPDATE SKIP LOCKED LIMIT 1
       ),
       job AS (
         UPDATE gateway_jobs j
            SET status = 'leased', lease_owner = $2, lease_expires_at = now() + interval '60 seconds',
                attempt_count = attempt_count + 1, updated_at = now()
           FROM candidate c
          WHERE j.id = c.id
          RETURNING j.id, j.action, j.device_id, j.gateway_id
       ),
       allocation AS (
         SELECT job.device_id, job.gateway_id,
                set_masklen(network(g.ipv4_cidr) + n.host_offset, 32)::inet AS ip
           FROM job JOIN gateways g ON g.id = job.gateway_id
           CROSS JOIN LATERAL generate_series(2, g.capacity_peers + 2) AS n(host_offset)
          WHERE job.action = 'provision_peer' AND g.ipv4_cidr IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM gateway_peers p
               WHERE p.gateway_id = job.gateway_id
                 AND p.assigned_ipv4 = set_masklen(network(g.ipv4_cidr) + n.host_offset, 32)::inet
                 AND p.status IN ('provisioning','active','revoking')
            )
          ORDER BY n.host_offset LIMIT 1
       ),
       peer AS (
         INSERT INTO gateway_peers(device_id, gateway_id, assigned_ipv4, status)
         SELECT device_id, gateway_id, ip, 'provisioning' FROM allocation
         ON CONFLICT (device_id, gateway_id) DO UPDATE
           SET assigned_ipv4 = EXCLUDED.assigned_ipv4, status = 'provisioning', revoked_at = NULL
         RETURNING device_id, gateway_id, assigned_ipv4
       )
       SELECT j.id, j.action, j.device_id, d.public_key,
              p.assigned_ipv4::text AS assigned_ipv4
         FROM job j JOIN devices d ON d.id = j.device_id
         LEFT JOIN peer p ON p.device_id = j.device_id AND p.gateway_id = j.gateway_id
         LEFT JOIN gateway_peers existing ON existing.device_id = j.device_id AND existing.gateway_id = j.gateway_id
        WHERE j.action = 'revoke_peer' OR p.device_id IS NOT NULL`,
      [gatewayId, gatewayId],
    );
    if (claimed.rowCount === 0) {
      await client.query(
        `UPDATE gateway_jobs SET status = 'failed', last_error_code = 'NO_GATEWAY_IP_CAPACITY',
                lease_owner = NULL, lease_expires_at = NULL, updated_at = now()
          WHERE gateway_id = $1 AND status = 'leased' AND lease_owner = $1
            AND action = 'provision_peer' AND id IN (
              SELECT id FROM gateway_jobs WHERE gateway_id = $1 AND status = 'leased'
                AND lease_owner = $1 AND action = 'provision_peer' ORDER BY created_at LIMIT 1
            ) AND NOT EXISTS (
              SELECT 1 FROM gateway_peers p WHERE p.device_id = gateway_jobs.device_id
                AND p.gateway_id = gateway_jobs.gateway_id AND p.status = 'provisioning'
            )`,
        [gatewayId],
      );
    }
    await client.query("COMMIT");
    if (!claimed.rowCount) return { job: null };
    return { job: claimed.rows[0] };
  } catch (error) {
    await client.query("ROLLBACK");
    requestLogError(error);
    return reply.code(503).send({ error: "AGENT_QUEUE_UNAVAILABLE" });
  } finally { client.release(); }
});

app.post("/v1/gateway-agent/jobs/:jobId/complete", async (request, reply) => {
  const params = z.object({ jobId: z.string().uuid() }).safeParse(request.params);
  const body = z.object({ gatewayId: z.string().uuid(), success: z.boolean() }).safeParse(request.body);
  if (!params.success || !body.success) return reply.code(400).send({ error: "INVALID_JOB_RESULT" });
  const { gatewayId, success } = body.data;
  if (!await gatewayAgentAuthenticated(request, gatewayId)) return reply.code(401).send({ error: "AGENT_UNAUTHORIZED" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const job = await client.query<{ id: string; device_id: string; action: string }>(
      `SELECT id, device_id, action FROM gateway_jobs
        WHERE id = $1 AND gateway_id = $2 AND status = 'leased'
          AND lease_owner = $2 AND lease_expires_at > now()
        FOR UPDATE`,
      [params.data.jobId, gatewayId],
    );
    if (!job.rowCount) {
      await client.query("ROLLBACK");
      return reply.code(404).send({ error: "LEASE_NOT_FOUND_OR_EXPIRED" });
    }
    if (success && job.rows[0].action === "revoke_peer") {
      const peer = await client.query(
        "UPDATE gateway_peers SET status = 'revoked', revoked_at = now() WHERE device_id = $1 AND gateway_id = $2 AND status = 'revoking' RETURNING id",
        [job.rows[0].device_id, gatewayId],
      );
      if (peer.rowCount) await client.query(
        "UPDATE gateways SET active_peers = GREATEST(0, active_peers - 1), updated_at = now() WHERE id = $1",
        [gatewayId],
      );
    }
    if (success && job.rows[0].action === "provision_peer") {
      const peer = await client.query(
        "UPDATE gateway_peers SET status = 'active' WHERE device_id = $1 AND gateway_id = $2 AND status = 'provisioning' RETURNING id",
        [job.rows[0].device_id, gatewayId],
      );
      if (!peer.rowCount) {
        await client.query("ROLLBACK");
        return reply.code(409).send({ error: "PROVISIONING_PEER_NOT_FOUND" });
      }
      await client.query("UPDATE devices SET status = 'active' WHERE id = $1", [job.rows[0].device_id]);
      await client.query("UPDATE gateways SET active_peers = active_peers + 1, updated_at = now() WHERE id = $1", [gatewayId]);
    }
    if (!success && job.rows[0].action === "provision_peer") {
      await client.query("UPDATE gateway_peers SET status = 'revoked', revoked_at = now() WHERE device_id = $1 AND gateway_id = $2 AND status = 'provisioning'", [job.rows[0].device_id, gatewayId]);
    }
    await client.query(
      `UPDATE gateway_jobs
          SET status = $2, completed_at = CASE WHEN $2 = 'succeeded' THEN now() ELSE NULL END,
              lease_owner = NULL, lease_expires_at = NULL, updated_at = now(),
              last_error_code = CASE WHEN $2 = 'failed' THEN 'AGENT_OPERATION_FAILED' ELSE NULL END
        WHERE id = $1`,
      [params.data.jobId, success ? "succeeded" : "failed"],
    );
    await client.query("COMMIT");
    return reply.code(204).send();
  } catch (error) {
    await client.query("ROLLBACK");
    requestLogError(error);
    return reply.code(503).send({ error: "AGENT_RESULT_UNAVAILABLE" });
  } finally { client.release(); }
});

app.get("/v1/health", async (_request, reply) => {
  try { await pool.query("SELECT 1"); return { status: "ok", database: "ready" }; }
  catch { return reply.code(503).send({ status: "degraded", database: "unavailable" }); }
});

app.post("/v1/auth/register", { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async (request, reply) => {
  const parsedBody = registerSchema.safeParse(request.body);
  if (!parsedBody.success) return reply.code(400).send({ error: "INVALID_REGISTRATION" });
  const { email, password, countryCode } = parsedBody.data;
  const passwordHash = await hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query<{ id: string; email: string }>(
      `INSERT INTO accounts(email, password_hash, country_code)
       VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING RETURNING id, email`,
      [email, passwordHash, countryCode?.toUpperCase() ?? null],
    );
    if (!inserted.rowCount) {
      await client.query("ROLLBACK");
      return reply.code(409).send({ error: "ACCOUNT_ALREADY_EXISTS" });
    }
    const session = await issueSession(client, inserted.rows[0]);
    await client.query("COMMIT");
    return reply.code(201).send({ account: { id: inserted.rows[0].id, email }, ...session });
  } catch (error) {
    await client.query("ROLLBACK");
    requestLogError(error);
    return reply.code(503).send({ error: "REGISTRATION_UNAVAILABLE" });
  } finally { client.release(); }
});

app.post("/v1/auth/login", { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } }, async (request, reply) => {
  const parsedBody = loginSchema.safeParse(request.body);
  if (!parsedBody.success) return reply.code(400).send({ error: "INVALID_CREDENTIALS" });
  const { email, password } = parsedBody.data;
  const result = await pool.query<AccountRow>(
    "SELECT id, email, password_hash, status FROM accounts WHERE email = $1 LIMIT 1", [email],
  );
  const account = result.rows[0];
  const valid = account?.password_hash ? await verifyPassword(password, account.password_hash) : false;
  if (!account || !valid || account.status !== "active") return reply.code(401).send({ error: "INVALID_EMAIL_OR_PASSWORD" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const session = await issueSession(client, account);
    await client.query("COMMIT");
    return { account: { id: account.id, email: account.email }, ...session };
  } catch (error) {
    await client.query("ROLLBACK");
    requestLogError(error);
    return reply.code(503).send({ error: "LOGIN_UNAVAILABLE" });
  } finally { client.release(); }
});

app.post("/v1/auth/refresh", { config: { rateLimit: { max: 20, timeWindow: "15 minutes" } } }, async (request, reply) => {
  const parsedBody = refreshSchema.safeParse(request.body);
  if (!parsedBody.success) return reply.code(400).send({ error: "INVALID_REFRESH_TOKEN" });
  const oldToken = parsedBody.data.refreshToken;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{
      id: string; account_id: string; family_id: string; email: string; status: string;
      expires_at: Date; revoked_at: Date | null;
    }>(
      `SELECT s.id, s.account_id, s.family_id, a.email, a.status, s.expires_at, s.revoked_at
         FROM auth_sessions s JOIN accounts a ON a.id = s.account_id
        WHERE s.refresh_token_hash = $1 FOR UPDATE OF s`, [tokenHash(oldToken)],
    );
    const session = found.rows[0];
    if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now() || session.status !== "active") {
      if (session?.revoked_at) {
        await client.query("UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE family_id = $1", [session.family_id]);
      }
      await client.query("COMMIT");
      return reply.code(401).send({ error: "INVALID_REFRESH_TOKEN" });
    }
    const next = await issueSession(client, { id: session.account_id, email: session.email }, session.family_id);
    await client.query(
      "UPDATE auth_sessions SET revoked_at = now(), last_used_at = now(), replaced_by = $2 WHERE id = $1",
      [session.id, next.sessionId],
    );
    await client.query("COMMIT");
    return { account: { id: session.account_id, email: session.email },
      accessToken: next.accessToken, refreshToken: next.refreshToken,
      tokenType: next.tokenType, expiresIn: next.expiresIn };
  } catch (error) {
    await client.query("ROLLBACK");
    requestLogError(error);
    return reply.code(503).send({ error: "REFRESH_UNAVAILABLE" });
  } finally { client.release(); }
});

app.post("/v1/auth/logout", async (request, reply) => {
  const parsedBody = refreshSchema.safeParse(request.body);
  if (!parsedBody.success) return reply.code(400).send({ error: "INVALID_REFRESH_TOKEN" });
  await pool.query(
    "UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE refresh_token_hash = $1",
    [tokenHash(parsedBody.data.refreshToken)],
  );
  return reply.code(204).send();
});

app.get("/v1/me", async (request, reply) => {
  const claims = await authenticate(request);
  if (!claims) return reply.code(401).send({ error: "UNAUTHORIZED" });
  const result = await pool.query<{ id: string; email: string; status: string; country_code: string | null }>(
    "SELECT id, email, status, country_code FROM accounts WHERE id = $1", [claims.sub],
  );
  const account = result.rows[0];
  if (!account || account.status !== "active") return reply.code(401).send({ error: "UNAUTHORIZED" });
  return { account: { id: account.id, email: account.email, countryCode: account.country_code } };
});


app.get("/v1/devices", async (request, reply) => {
  const claims = await authenticate(request);
  if (!claims) return reply.code(401).send({ error: "UNAUTHORIZED" });
  const account = await pool.query("SELECT 1 FROM accounts WHERE id = $1 AND status = 'active'", [claims.sub]);
  if (!account.rowCount) return reply.code(401).send({ error: "UNAUTHORIZED" });
  const result = await pool.query<{
    id: string; platform: string; device_label: string | null; status: string;
    created_at: Date; last_seen_at: Date | null;
  }>(
    `SELECT id, platform, device_label, status, created_at, last_seen_at
       FROM devices WHERE account_id = $1 ORDER BY created_at DESC`, [claims.sub],
  );
  return { devices: result.rows.map((device) => ({
    id: device.id, platform: device.platform, label: device.device_label,
    status: device.status, createdAt: device.created_at, lastSeenAt: device.last_seen_at,
  })) };
});

app.post("/v1/devices", async (request, reply) => {
  const claims = await authenticate(request);
  if (!claims) return reply.code(401).send({ error: "UNAUTHORIZED" });
  const parsedBody = deviceCreateSchema.safeParse(request.body);
  if (!parsedBody.success || !isWireGuardPublicKey(parsedBody.data?.publicKey ?? "")) {
    return reply.code(400).send({ error: "INVALID_DEVICE" });
  }
  const { platform, label, publicKey } = parsedBody.data;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const account = await client.query("SELECT id FROM accounts WHERE id = $1 AND status = 'active' FOR UPDATE", [claims.sub]);
    if (!account.rowCount) {
      await client.query("ROLLBACK");
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }
    const count = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM devices WHERE account_id = $1 AND status <> 'revoked'", [claims.sub]);
    if (Number(count.rows[0]?.count ?? 0) >= 5) {
      await client.query("ROLLBACK");
      return reply.code(409).send({ error: "DEVICE_LIMIT_REACHED" });
    }
    const result = await client.query<{ id: string; status: string; created_at: Date }>("INSERT INTO devices(account_id, platform, device_label, public_key, status) VALUES ($1, $2, $3, $4, 'pending') RETURNING id, status, created_at", [claims.sub, platform, label ?? null, publicKey]);
    await client.query("COMMIT");
    return reply.code(201).send({ device: { id: result.rows[0].id, platform, label: label ?? null, status: result.rows[0].status, createdAt: result.rows[0].created_at } });
  } catch (error) {
    await client.query("ROLLBACK");
    const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "UNKNOWN";
    if (code === "23505") return reply.code(409).send({ error: "DEVICE_KEY_ALREADY_REGISTERED" });
    requestLogError(error);
    return reply.code(503).send({ error: "DEVICE_REGISTRATION_UNAVAILABLE" });
  } finally { client.release(); }
});

app.delete("/v1/devices/:deviceId", async (request, reply) => {
  const claims = await authenticate(request);
  if (!claims) return reply.code(401).send({ error: "UNAUTHORIZED" });
  const params = z.object({ deviceId: z.string().uuid() }).safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: "INVALID_DEVICE_ID" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ id: string }>(
      `UPDATE devices SET status = 'revoked'
        WHERE id = $1 AND account_id = $2 AND status <> 'revoked' AND EXISTS (SELECT 1 FROM accounts WHERE id = $2 AND status = 'active')
        RETURNING id`, [params.data.deviceId, claims.sub],
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return reply.code(404).send({ error: "DEVICE_NOT_FOUND" });
    }
    // Keep gateway peers in revoking state until the private gateway agent confirms removal.
    await client.query(
      `UPDATE gateway_peers SET status = 'revoking'
        WHERE device_id = $1 AND status = 'active'`, [params.data.deviceId],
    );
    await client.query(
      `INSERT INTO gateway_jobs(device_id, gateway_id, action, status)
       SELECT device_id, gateway_id, 'revoke_peer', 'queued'
         FROM gateway_peers
        WHERE device_id = $1 AND status = 'revoking'
       ON CONFLICT (device_id, gateway_id, action)
         WHERE status IN ('queued', 'leased') DO NOTHING`,
      [params.data.deviceId],
    );
    await client.query("COMMIT");
    return reply.code(204).send();
  } catch (error) {
    await client.query("ROLLBACK");
    requestLogError(error);
    return reply.code(503).send({ error: "DEVICE_REVOCATION_UNAVAILABLE" });
  } finally { client.release(); }
});



app.post("/v1/devices/:deviceId/provisioning-requests", async (request, reply) => {
  const claims = await authenticate(request);
  if (!claims) return reply.code(401).send({ error: "UNAUTHORIZED" });
  const params = z.object({ deviceId: z.string().uuid() }).safeParse(request.params);
  const body = z.object({ gatewayId: z.string().uuid().optional() }).safeParse(request.body ?? {});
  if (!params.success || !body.success) return reply.code(400).send({ error: "INVALID_PROVISIONING_REQUEST" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const deviceResult = await client.query<{ id: string; status: string }>(
      `SELECT d.id, d.status FROM devices d
         JOIN accounts a ON a.id = d.account_id
        WHERE d.id = $1 AND d.account_id = $2 AND a.status = 'active'
          AND d.status IN ('pending', 'active')
        FOR UPDATE OF d`,
      [params.data.deviceId, claims.sub],
    );
    if (!deviceResult.rowCount) {
      await client.query("ROLLBACK");
      return reply.code(404).send({ error: "DEVICE_NOT_FOUND" });
    }

    const entitlement = await client.query(
      `SELECT 1 FROM subscriptions
        WHERE account_id = $1
          AND status IN ('trialing', 'active', 'grace_period')
          AND (current_period_end IS NULL OR current_period_end > now())
        LIMIT 1`,
      [claims.sub],
    );
    if (!entitlement.rowCount) {
      await client.query("ROLLBACK");
      return reply.code(403).send({ error: "SUBSCRIPTION_REQUIRED" });
    }

    const existing = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM gateway_jobs
        WHERE device_id = $1 AND action = 'provision_peer'
          AND status IN ('queued', 'leased')
        ORDER BY created_at DESC LIMIT 1`,
      [params.data.deviceId],
    );
    if (existing.rowCount) {
      await client.query("COMMIT");
      return reply.code(202).send({ requestId: existing.rows[0].id, status: existing.rows[0].status });
    }

    const activePeer = await client.query(
      "SELECT 1 FROM gateway_peers WHERE device_id = $1 AND status = 'active' LIMIT 1",
      [params.data.deviceId],
    );
    if (activePeer.rowCount) {
      await client.query("ROLLBACK");
      return reply.code(409).send({ error: "DEVICE_ALREADY_PROVISIONED" });
    }

    const gateway = await client.query<{ id: string }>(
      `SELECT g.id FROM gateways g
        WHERE g.status = 'online'
          AND ($1::uuid IS NULL OR g.id = $1)
          AND g.active_peers + (
            SELECT count(*)::int FROM gateway_jobs j
             WHERE j.gateway_id = g.id AND j.action = 'provision_peer'
               AND j.status IN ('queued', 'leased')
          ) < g.capacity_peers
        ORDER BY
          ((g.active_peers + (
            SELECT count(*)::int FROM gateway_jobs j
             WHERE j.gateway_id = g.id AND j.action = 'provision_peer'
               AND j.status IN ('queued', 'leased')
          ))::numeric / g.capacity_peers::numeric) ASC,
          g.country_code ASC, g.display_name ASC
        FOR UPDATE OF g SKIP LOCKED
        LIMIT 1`,
      [body.data.gatewayId ?? null],
    );
    if (!gateway.rowCount) {
      await client.query("ROLLBACK");
      return reply.code(409).send({ error: "NO_GATEWAY_CAPACITY" });
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO gateway_jobs(device_id, gateway_id, action, status)
       VALUES ($1, $2, 'provision_peer', 'queued')
       RETURNING id`,
      [params.data.deviceId, gateway.rows[0].id],
    );
    await client.query("COMMIT");
    return reply.code(202).send({ requestId: inserted.rows[0].id, status: "queued" });
  } catch (error) {
    await client.query("ROLLBACK");
    requestLogError(error);
    return reply.code(503).send({ error: "PROVISIONING_REQUEST_UNAVAILABLE" });
  } finally { client.release(); }
});

app.get("/v1/me/subscription", async (request, reply) => {
  const claims = await authenticate(request);
  if (!claims) return reply.code(401).send({ error: "UNAUTHORIZED" });
  const account = await pool.query("SELECT 1 FROM accounts WHERE id = $1 AND status = 'active'", [claims.sub]);
  if (!account.rowCount) return reply.code(401).send({ error: "UNAUTHORIZED" });
  const result = await pool.query<{
    plan_code: string; status: string; currency: string | null;
    current_period_start: Date | null; current_period_end: Date | null;
    cancel_at_period_end: boolean;
  }>(
    `SELECT plan_code, status, currency, current_period_start, current_period_end, cancel_at_period_end
       FROM subscriptions
      WHERE account_id = $1
        AND status IN ('trialing', 'active', 'grace_period')
        AND (current_period_end IS NULL OR current_period_end > now())
      ORDER BY current_period_end DESC NULLS FIRST, created_at DESC
      LIMIT 1`, [claims.sub],
  );
  const subscription = result.rows[0];
  if (!subscription) return { subscription: null, entitled: false };
  return {
    subscription: {
      planCode: subscription.plan_code,
      status: subscription.status,
      currency: subscription.currency,
      currentPeriodStart: subscription.current_period_start,
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
    entitled: true,
  };
});

app.get("/v1/servers", async (_request, reply) => {
  try {
    const result = await pool.query<{
      id: string; code: string; display_name: string; country_code: string; city: string;
      endpoint_host: string; endpoint_port: number; public_key: string; active_peers: number; capacity_peers: number;
    }>(
      `SELECT id, code, display_name, country_code, city, endpoint_host,
              endpoint_port, public_key, active_peers, capacity_peers
         FROM gateways WHERE status = 'online' AND active_peers < capacity_peers
        ORDER BY country_code ASC,
                 (active_peers::numeric / capacity_peers::numeric) ASC, display_name ASC`,
    );
    return { servers: result.rows.map((row) => ({
      id: row.id, code: row.code, name: row.display_name, countryCode: row.country_code,
      city: row.city, endpoint: `${row.endpoint_host}:${row.endpoint_port}`, publicKey: row.public_key,
      loadPercent: Math.min(100, Math.round((row.active_peers / row.capacity_peers) * 100)),
    })) };
  } catch (error) {
    requestLogError(error);
    return reply.code(503).send({ error: "SERVER_CATALOG_UNAVAILABLE" });
  }
});

function requestLogError(error: unknown) {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code) : "UNKNOWN";
  app.log.error({ databaseErrorCode: code }, "Database operation failed");
}
app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: "NOT_FOUND" }));
app.setErrorHandler((error: unknown, _request, reply) => {
  const statusCode = typeof error === "object" && error !== null && "statusCode" in error
    ? Number((error as { statusCode: unknown }).statusCode) : 500;
  const errorCode = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code) : "UNKNOWN";
  if (statusCode === 429) return reply.code(429).send({ error: "RATE_LIMITED" });
  app.log.error({ errorCode }, "Unhandled request error");
  return reply.code(500).send({ error: "INTERNAL_ERROR" });
});
const close = async () => { await app.close(); await pool.end(); };
process.once("SIGINT", () => void close().then(() => process.exit(0)));
process.once("SIGTERM", () => void close().then(() => process.exit(0)));
try { await app.listen({ host: env.HOST, port: env.PORT }); }
catch (error) {
  app.log.error({ errorCode: error instanceof Error ? error.name : "UNKNOWN" }, "Could not start control plane");
  await close();
  process.exit(1);
}
