export type NexaServer = {
  id: string; code: string; name: string; countryCode: string; city: string;
  endpoint: string; publicKey: string; loadPercent: number;
};
type SessionResponse = { account: { id: string; email: string }; accessToken: string; refreshToken: string };
async function request<T>(baseUrl: string, path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(base)) throw new Error("Укажите HTTPS-адрес работающего NEXA API.");
  const response = await fetch(base + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}), ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "API_ERROR_" + response.status);
  return body as T;
}
export const nexaApi = {
  login: (base: string, email: string, password: string) =>
    request<SessionResponse>(base, "/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  register: (base: string, email: string, password: string) =>
    request<SessionResponse>(base, "/v1/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  servers: (base: string) => request<{ servers: NexaServer[] }>(base, "/v1/servers"),
};
