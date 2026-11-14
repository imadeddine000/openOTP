/** API client for the openOTP SaaS frontend. */
async function req(method, path, { body, token, apiKey } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (apiKey) headers['x-api-key'] = apiKey;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

export const api = {
  // auth
  register: (email, password) => req('POST', '/api/auth/register', { body: { email, password } }),
  login: (email, password) => req('POST', '/api/auth/login', { body: { email, password } }),
  me: (token) => req('GET', '/api/auth/me', { token }),
  // client API keys
  listApiKeys: (token) => req('GET', '/api/auth/api-keys', { token }),
  createApiKey: (token, label) => req('POST', '/api/auth/api-keys', { token, body: { label } }),
  revokeApiKey: (token, id) => req('DELETE', `/api/auth/api-keys/${id}`, { token }),
  // gateway (dashboard)
  stats: (token) => req('GET', '/gateway/stats', { token }),
  devices: (token) => req('GET', '/gateway/devices', { token }),
  // client API (/api/v1) — what the client portal uses
  clientAccount: (apiKey) => req('GET', '/api/v1/account', { apiKey }),
  clientSendMessage: (apiKey, to, message) => req('POST', '/api/v1/messages', { apiKey, body: { to, message } }),
  clientMessages: (apiKey, { page = 1, status = '', type = 'sent' } = {}) =>
    req('GET', `/api/v1/messages?page=${page}&limit=50${status ? `&status=${encodeURIComponent(status)}` : ''}${type ? `&type=${encodeURIComponent(type)}` : ''}`, { apiKey }),
  // admin
  adminStats: (token) => req('GET', '/api/admin/stats', { token }),
  adminAnalytics: (token) => req('GET', '/api/admin/analytics', { token }),
  adminUsers: (token) => req('GET', '/api/admin/users', { token }),
  adminCreateUser: (token, email, password, role) => req('POST', '/api/admin/users', { token, body: { email, password, role } }),
  adminUpdateUser: (token, id, patch) => req('PATCH', `/api/admin/users/${id}`, { token, body: patch }),
  adminDeleteUser: (token, id) => req('DELETE', `/api/admin/users/${id}`, { token }),
  adminImportUsers: (token, users) => req('POST', '/api/admin/users/import', { token, body: { users } }),
  adminDevices: (token) => req('GET', '/api/admin/devices', { token }),
  adminUpdateDevice: (token, id, patch) => req('PATCH', `/api/admin/devices/${id}`, { token, body: patch }),
  adminDeleteDevice: (token, id) => req('DELETE', `/api/admin/devices/${id}`, { token }),
  adminMessages: (token, qs = '') => req('GET', `/api/admin/messages${qs}`, { token }),
  adminDeleteMessage: (token, id) => req('DELETE', `/api/admin/messages/${id}`, { token }),
  adminBatches: (token, qs = '') => req('GET', `/api/admin/batches${qs}`, { token }),
};
