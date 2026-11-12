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
  servers: (base: string, token?: string) => request<{ servers: NexaServer[] }>(base, "/v1/servers", {}, token),
  createDevice: (base: string, token: string, platform: "android" | "ios", publicKey: string, label: string) =>
    request<{ device: { id: string; status: string } }>(base, "/v1/devices", {
      method: "POST", body: JSON.stringify({ platform, publicKey, label }),
    }, token),
  provisionDevice: (base: string, token: string, deviceId: string, gatewayId: string) =>
    request<{ requestId: string; status: string }>(base, `/v1/devices/${deviceId}/provisioning-requests`, {
      method: "POST", body: JSON.stringify({ gatewayId }),
    }, token),
  deviceStatus: (base: string, token: string, deviceId: string) =>
    request<{ requestId: string | null; jobStatus: string | null; deviceStatus: string | null;
      profile: null | { address: string; endpoint: string; serverPublicKey: string; serverName: string; dns: string[] } }>(
      base, `/v1/devices/${deviceId}/provisioning-status`, {}, token),

};
