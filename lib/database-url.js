/** PostgreSQL 連線字串解析、正規化與 Render 常見修復 */

function stripEnvQuotes(value) {
  const s = String(value ?? '').trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1).trim();
  }
  return s;
}

function toPostgresUrl(raw) {
  const s = stripEnvQuotes(raw);
  if (!s) return '';
  return s.replace(/^postgres:\/\//i, 'postgresql://');
}

function parseDbHost(url) {
  try {
    return new URL(toPostgresUrl(url)).hostname || '';
  } catch {
    return '';
  }
}

function maskDatabaseUrl(url) {
  try {
    const u = new URL(toPostgresUrl(url));
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '(invalid DATABASE_URL)';
  }
}

function isRenderShortHost(host) {
  return /^dpg-[a-z0-9]+-[a-z0-9]$/i.test(host || '');
}

function renderPostgresRegion() {
  return (
    stripEnvQuotes(process.env.RENDER_POSTGRES_REGION) ||
    stripEnvQuotes(process.env.RENDER_REGION) ||
    'oregon'
  );
}

function expandRenderPostgresUrl(url) {
  try {
    const u = new URL(toPostgresUrl(url));
    if (!isRenderShortHost(u.hostname)) return toPostgresUrl(url);
    u.hostname = `${u.hostname}.${renderPostgresRegion()}-postgres.render.com`;
    return u.toString();
  } catch {
    return toPostgresUrl(url);
  }
}

function shouldUseSsl(url) {
  if (!url) return false;
  if (/localhost|127\.0\.0\.1/i.test(url)) return false;
  return true;
}

function buildConnectionCandidates() {
  const primary = toPostgresUrl(process.env.DATABASE_URL);
  const external = toPostgresUrl(process.env.DATABASE_EXTERNAL_URL);
  const seen = new Set();
  const out = [];

  function push(label, url) {
    const normalized = toPostgresUrl(url);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push({ label, url: normalized });
  }

  push('DATABASE_URL', primary);
  if (primary && isRenderShortHost(parseDbHost(primary))) {
    push('DATABASE_URL (expanded FQDN)', expandRenderPostgresUrl(primary));
  }
  push('DATABASE_EXTERNAL_URL', external);

  return out;
}

function validateDatabaseUrl(url) {
  if (!url) return { ok: false, reason: '未設定 DATABASE_URL' };
  const host = parseDbHost(url);
  if (!host) return { ok: false, reason: 'DATABASE_URL 格式無效（無法解析 hostname）' };
  if (host.length < 4) {
    return { ok: false, reason: `DATABASE_URL hostname 過短：${host}` };
  }
  return { ok: true, host };
}

/** 啟動前正規化 env（去除引號、避免誤貼造成截斷） */
function normalizeDatabaseEnv() {
  const keys = ['DATABASE_URL', 'DATABASE_EXTERNAL_URL'];
  keys.forEach((key) => {
    const raw = process.env[key];
    if (!raw) return;
    process.env[key] = stripEnvQuotes(raw);
  });
}

function hasDatabaseConfig() {
  return !!(stripEnvQuotes(process.env.DATABASE_URL) || stripEnvQuotes(process.env.DATABASE_EXTERNAL_URL));
}

function describeDatabaseConfig() {
  const candidates = buildConnectionCandidates();
  if (!candidates.length) {
    return { configured: false, candidates: [], primaryHost: '' };
  }
  return {
    configured: true,
    candidates: candidates.map((c) => ({
      label: c.label,
      host: parseDbHost(c.url),
      masked: maskDatabaseUrl(c.url),
    })),
    primaryHost: parseDbHost(candidates[0].url),
  };
}

module.exports = {
  stripEnvQuotes,
  toPostgresUrl,
  parseDbHost,
  maskDatabaseUrl,
  isRenderShortHost,
  expandRenderPostgresUrl,
  shouldUseSsl,
  buildConnectionCandidates,
  validateDatabaseUrl,
  normalizeDatabaseEnv,
  hasDatabaseConfig,
  describeDatabaseConfig,
};
