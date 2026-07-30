export function resolveSmokeAuthentication({
  token = '',
  email = '',
  password = '',
  includeDb = false,
} = {}) {
  const normalizedToken = String(token || '').trim();
  const normalizedEmail = String(email || '').trim();
  const normalizedPassword = String(password || '');
  if (normalizedToken) return { mode: 'bearer', token: normalizedToken };
  if (!includeDb && !normalizedEmail && !normalizedPassword) return { mode: 'none' };
  if (normalizedEmail && normalizedPassword) {
    return { mode: 'session', email: normalizedEmail, password: normalizedPassword };
  }
  if (normalizedEmail || normalizedPassword) {
    return {
      mode: 'invalid',
      error: 'Both DEPLOY_SMOKE_LOGIN_EMAIL and DEPLOY_SMOKE_LOGIN_PASSWORD are required.',
    };
  }
  return { mode: 'none' };
}

export function extractSessionCookie(headers) {
  const values = typeof headers?.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [headers?.get?.('set-cookie')].filter(Boolean);
  const cookie = values
    .flatMap((value) => String(value || '').split(/,(?=\s*[^;,=\s]+=[^;,]+)/))
    .map((value) => value.trim().split(';', 1)[0])
    .find((value) => value && value.includes('='));
  return cookie || '';
}

/**
 * @param {{
 *   baseUrl?: string,
 *   includeDb?: boolean,
 *   token?: string,
 *   email?: string,
 *   password?: string,
 *   fetchImpl?: typeof fetch
 * }} [options]
 */
export async function prepareSmokeAuthentication({
  baseUrl,
  includeDb = false,
  token = '',
  email = '',
  password = '',
  fetchImpl = fetch,
} = {}) {
  const config = resolveSmokeAuthentication({ token, email, password, includeDb });
  if (config.mode === 'bearer') {
    return {
      ok: true,
      mode: 'bearer',
      headers: { Authorization: `Bearer ${config.token}` },
      message: 'Bearer authentication configured.',
    };
  }
  if (config.mode === 'invalid') {
    return { ok: false, mode: 'invalid', headers: {}, error: config.error };
  }
  if (config.mode !== 'session') {
    return {
      ok: !includeDb,
      mode: 'none',
      headers: {},
      error: includeDb
        ? 'Authenticated DB smoke requires DEPLOY_SMOKE_AUTH_TOKEN or DEPLOY_SMOKE_LOGIN_EMAIL and DEPLOY_SMOKE_LOGIN_PASSWORD.'
        : '',
    };
  }

  try {
    const response = await fetchImpl(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: config.email, password: config.password }),
    });
    if (!response.ok) {
      return {
        ok: false,
        mode: 'session',
        status: response.status,
        headers: {},
        error: `Smoke login returned HTTP ${response.status}.`,
      };
    }
    const cookie = extractSessionCookie(response.headers);
    if (!cookie) {
      return {
        ok: false,
        mode: 'session',
        status: response.status,
        headers: {},
        error: 'Smoke login succeeded without returning a session cookie.',
      };
    }
    return {
      ok: true,
      mode: 'session',
      status: response.status,
      headers: { Cookie: cookie },
      message: 'Session authentication succeeded.',
    };
  } catch (error) {
    return {
      ok: false,
      mode: 'session',
      headers: {},
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
