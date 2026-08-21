const PARTNERS = [
  { id: "mclovin", displayName: "McLovin" },
  { id: "casual", displayName: "Casual" },
] as const;

type PartnerId = (typeof PARTNERS)[number]["id"];

type AuthEnv = {
  DB: D1Database;
  SURVIVOR_POOL_PASSWORD?: string;
};

type PartnerAccount = {
  id: PartnerId;
  display_name: string;
  password_hash: string | null;
  failed_attempts: number;
  locked_until: string | null;
};

type AuthBody = {
  partner?: unknown;
  password?: unknown;
  confirmPassword?: unknown;
  bootstrap?: unknown;
};

const AUTH_COOKIE = "survivor_pool_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const PASSWORD_ITERATIONS = 120_000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const authStorageInitialization = new WeakMap<D1Database, Promise<void>>();

async function ensureAuthStorage(env: AuthEnv) {
  const existing = authStorageInitialization.get(env.DB);
  if (existing) return existing;

  const initialization = (async () => {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS partner_accounts (
      id TEXT PRIMARY KEY NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT,
      failed_attempts INTEGER DEFAULT 0 NOT NULL,
      locked_until TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      last_login_at TEXT
    )`).run();
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS partner_sessions (
      token_hash TEXT PRIMARY KEY NOT NULL,
      partner_id TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
      expires_at TEXT NOT NULL
    )`).run();
    for (const partner of PARTNERS) {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO partner_accounts (id, display_name) VALUES (?1, ?2)",
      ).bind(partner.id, partner.displayName).run();
    }
  })();
  authStorageInitialization.set(env.DB, initialization);
  try {
    return await initialization;
  } catch (error) {
    authStorageInitialization.delete(env.DB);
    throw error;
  }
}

function json(data: Record<string, unknown>, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return Response.json(data, { ...init, headers });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
  })[character] ?? character);
}

function isPartner(value: unknown): value is PartnerId {
  return typeof value === "string" && PARTNERS.some((partner) => partner.id === value);
}

function partnerLabel(id: PartnerId) {
  return PARTNERS.find((partner) => partner.id === id)?.displayName ?? id;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string) {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function randomHex(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function passwordHash(password: string, saltHex = randomHex(16)) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBytes(saltHex), iterations: PASSWORD_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2$${PASSWORD_ITERATIONS}$${saltHex}$${bytesToHex(new Uint8Array(derived))}`;
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function passwordMatches(password: string, storedHash: string) {
  const [algorithm, iterationsText, saltHex, expectedHash] = storedHash.split("$");
  if (algorithm !== "pbkdf2" || iterationsText !== String(PASSWORD_ITERATIONS) || !saltHex || !expectedHash) return false;
  const actual = (await passwordHash(password, saltHex)).split("$")[3] ?? "";
  return constantTimeEqual(actual, expectedHash);
}

function cookieValue(request: Request) {
  const cookies = request.headers.get("cookie")?.split(";") ?? [];
  const entry = cookies.find((cookie) => cookie.trim().startsWith(`${AUTH_COOKIE}=`));
  return entry?.trim().slice(`${AUTH_COOKIE}=`.length) ?? "";
}

function sessionCookie(token: string, maxAge = SESSION_MAX_AGE) {
  return `${AUTH_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

async function requestBody(request: Request) {
  return (await request.json().catch(() => null)) as AuthBody | null;
}

async function findAccount(env: AuthEnv, partner: PartnerId) {
  await ensureAuthStorage(env);
  return env.DB.prepare(
    "SELECT id, display_name, password_hash, failed_attempts, locked_until FROM partner_accounts WHERE id = ?1",
  ).bind(partner).first<PartnerAccount>();
}

async function newSession(env: AuthEnv, partner: PartnerId) {
  await ensureAuthStorage(env);
  const token = randomHex(32);
  const tokenHash = await sha256Hex(`session:${token}`);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE * 1000).toISOString();
  await env.DB.prepare(
    "INSERT INTO partner_sessions (token_hash, partner_id, expires_at) VALUES (?1, ?2, ?3)",
  ).bind(tokenHash, partner, expiresAt).run();
  return { token, expiresAt };
}

export async function sessionPartnerId(request: Request, env: AuthEnv) {
  await ensureAuthStorage(env);
  const token = cookieValue(request);
  if (!token) return null;
  const tokenHash = await sha256Hex(`session:${token}`);
  const session = await env.DB.prepare(
    "SELECT partner_id, expires_at FROM partner_sessions WHERE token_hash = ?1",
  ).bind(tokenHash).first<{ partner_id: PartnerId; expires_at: string }>();
  if (!session || Date.parse(session.expires_at) <= Date.now()) {
    if (session) await env.DB.prepare("DELETE FROM partner_sessions WHERE token_hash = ?1").bind(tokenHash).run();
    return null;
  }
  return isPartner(session.partner_id) ? session.partner_id : null;
}

function loginPage(message = "") {
  const partnerOptions = PARTNERS.map((partner) => `<option value="${partner.id}">${partner.displayName}</option>`).join("");
  const escapedMessage = escapeHtml(message);
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Survivor Pool Strategizer · Sign in</title><style>
html,body{margin:0;min-height:100%;font-family:Arial,Helvetica,sans-serif;background:#f7f8fa;color:#172033}body{display:grid;place-items:center;padding:24px}.card{width:min(100%,440px);padding:32px;background:#fff;border:1px solid #e2e6ec;border-radius:14px;box-shadow:0 18px 40px rgba(24,36,59,.1)}.mark{display:grid;place-items:center;width:38px;height:38px;border-radius:10px;background:#e66942;color:#fff;font-weight:800;font-size:12px}.eyebrow{margin:26px 0 10px;color:#e66942;font-size:10px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase}.title{margin:0;color:#18243b;font-size:31px;line-height:1.05;letter-spacing:-1.2px}.copy{margin:13px 0 25px;color:#6c7587;font-size:14px;line-height:1.6}label{display:block;margin:16px 0 7px;color:#6c7587;font-size:11px;font-weight:700}select,input{width:100%;padding:12px 13px;box-sizing:border-box;border:1px solid #e2e6ec;border-radius:7px;color:#172033;background:#fff;outline:none;font-size:14px}select:focus,input:focus{border-color:#e66942;box-shadow:0 0 0 3px rgba(230,105,66,.12)}button{width:100%;margin-top:14px;padding:12px 15px;border:0;border-radius:7px;color:#fff;background:#e66942;font-size:12px;font-weight:800;cursor:pointer}button.secondary{color:#b4573a;background:#fff0eb;border:1px solid #f5c4b3}.setup{margin-top:24px;padding-top:22px;border-top:1px solid #edf0f3}.setup h2{margin:0;color:#18243b;font-size:15px}.setup p,.status,.error{color:#6c7587;font-size:11px;line-height:1.5}.status{min-height:17px;margin-top:10px}.error{min-height:17px;margin-top:12px;color:#b4573a}.fine{margin-top:20px;color:#a3abb6;font-size:10px;line-height:1.5}
</style></head><body><main class="card"><div class="mark">SP</div><p class="eyebrow">Private shared workspace</p><h1 class="title">Pick together.<br>Keep one alive.</h1><p class="copy">Choose your partner account to sign in to the shared Survivor Pool Strategizer workspace.</p><form id="login-form"><label for="partner">Partner account</label><select id="partner" name="partner">${partnerOptions}</select><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" autofocus required minlength="10"><button type="submit">Sign in</button><p class="error" id="login-error">${escapedMessage}</p></form><section class="setup"><h2>First-time setup</h2><p>Each partner sets their password once. The existing shared bootstrap passphrase is required only during setup.</p><form id="setup-form"><label for="setup-password">New password</label><input id="setup-password" type="password" autocomplete="new-password" minlength="10" required><label for="confirm-password">Confirm password</label><input id="confirm-password" type="password" autocomplete="new-password" minlength="10" required><label for="bootstrap">Shared bootstrap passphrase</label><input id="bootstrap" type="password" autocomplete="off" required><button class="secondary" type="submit">Set first password</button><p class="status" id="account-status">Checking account status…</p><p class="error" id="setup-error"></p></form></section><p class="fine">This login protects the shared board with account-specific passwords, server-side sessions, and a modest failed-login lockout.</p></main><script>
const partner=document.getElementById('partner');const loginForm=document.getElementById('login-form');const setupForm=document.getElementById('setup-form');const loginError=document.getElementById('login-error');const setupError=document.getElementById('setup-error');const accountStatus=document.getElementById('account-status');
async function status(){try{const response=await fetch('/api/auth/status',{cache:'no-store'});const data=await response.json();const account=data.accounts?.find((item)=>item.id===partner.value);accountStatus.textContent=account?.configured?'This account already has a password.':'This account still needs its first password.';}catch{accountStatus.textContent='Account status is unavailable until the database is ready.';}}
partner.addEventListener('change',status);status();
loginForm.addEventListener('submit',async(event)=>{event.preventDefault();loginError.textContent='';const response=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({partner:partner.value,password:document.getElementById('password').value})});const data=await response.json().catch(()=>({}));if(response.ok){window.location.href='/';return}loginError.textContent=data.error||'Sign-in was not accepted.';});
setupForm.addEventListener('submit',async(event)=>{event.preventDefault();setupError.textContent='';const password=document.getElementById('setup-password').value;const confirmPassword=document.getElementById('confirm-password').value;if(password!==confirmPassword){setupError.textContent='The passwords do not match.';return}const response=await fetch('/api/auth/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({partner:partner.value,password,confirmPassword,bootstrap:document.getElementById('bootstrap').value})});const data=await response.json().catch(()=>({}));if(response.ok){window.location.href='/';return}setupError.textContent=data.error||'First-time setup was not accepted.';status();});
</script></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

async function statusRoute(env: AuthEnv) {
  try {
    await ensureAuthStorage(env);
    const result = await env.DB.prepare(
      "SELECT id, display_name, password_hash FROM partner_accounts ORDER BY id",
    ).all<{ id: PartnerId; display_name: string; password_hash: string | null }>();
    const byId = new Map(result.results.map((account) => [account.id, account]));
    return json({
      accounts: PARTNERS.map((partner) => ({
        id: partner.id,
        displayName: byId.get(partner.id)?.display_name ?? partner.displayName,
        configured: Boolean(byId.get(partner.id)?.password_hash),
      })),
    });
  } catch {
    return json({ error: "Authentication storage is not ready yet." }, { status: 503 });
  }
}

function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 10 && value.length <= 200;
}

async function setupRoute(request: Request, env: AuthEnv) {
  if (!env.SURVIVOR_POOL_PASSWORD) return json({ error: "First-time setup is not configured." }, { status: 503 });
  const body = await requestBody(request);
  if (!body || !isPartner(body.partner) || !validPassword(body.password) || body.password !== body.confirmPassword) {
    return json({ error: "Choose a partner and enter matching passwords of at least 10 characters." }, { status: 400 });
  }
  if (typeof body.bootstrap !== "string" || body.bootstrap !== env.SURVIVOR_POOL_PASSWORD) {
    return json({ error: "The shared bootstrap passphrase is not correct." }, { status: 401 });
  }

  try {
    let account = await findAccount(env, body.partner);
    if (!account) {
      await env.DB.prepare("INSERT INTO partner_accounts (id, display_name) VALUES (?1, ?2)").bind(body.partner, partnerLabel(body.partner)).run();
      account = await findAccount(env, body.partner);
    }
    if (!account || account.password_hash) return json({ error: "This partner account already has a password." }, { status: 409 });
    const hash = await passwordHash(body.password);
    const update = await env.DB.prepare("UPDATE partner_accounts SET password_hash = ?1 WHERE id = ?2 AND password_hash IS NULL").bind(hash, body.partner).run();
    if (update.meta.changes !== 1) return json({ error: "This partner account already has a password." }, { status: 409 });
    const session = await newSession(env, body.partner);
    return json({ ok: true, partner: body.partner }, { headers: { "set-cookie": sessionCookie(session.token) } });
  } catch {
    return json({ error: "Authentication storage is not ready yet." }, { status: 503 });
  }
}

async function loginRoute(request: Request, env: AuthEnv) {
  const body = await requestBody(request);
  if (!body || !isPartner(body.partner) || typeof body.password !== "string") {
    return json({ error: "Choose a partner and enter its password." }, { status: 400 });
  }

  try {
    const account = await findAccount(env, body.partner);
    const now = Date.now();
    if (!account) return json({ error: "That partner account or password was not accepted." }, { status: 401 });
    if (account.locked_until && Date.parse(account.locked_until) > now) {
      return json({ error: "Too many failed attempts. Try again in about 15 minutes." }, { status: 429 });
    }
    if (!account.password_hash) return json({ error: "Set this partner's first password before signing in." }, { status: 428 });
    if (!(await passwordMatches(body.password, account.password_hash))) {
      const failedAttempts = (account.failed_attempts ?? 0) + 1;
      const lockedUntil = failedAttempts >= MAX_FAILED_ATTEMPTS ? new Date(now + LOCKOUT_MS).toISOString() : null;
      await env.DB.prepare("UPDATE partner_accounts SET failed_attempts = ?1, locked_until = ?2 WHERE id = ?3").bind(failedAttempts, lockedUntil, body.partner).run();
      return json({ error: "That partner account or password was not accepted." }, { status: 401 });
    }
    await env.DB.prepare("UPDATE partner_accounts SET failed_attempts = 0, locked_until = NULL, last_login_at = ?1 WHERE id = ?2").bind(new Date(now).toISOString(), body.partner).run();
    const session = await newSession(env, body.partner);
    return json({ ok: true, partner: body.partner }, { headers: { "set-cookie": sessionCookie(session.token) } });
  } catch {
    return json({ error: "Authentication storage is not ready yet." }, { status: 503 });
  }
}

async function logoutRoute(request: Request, env: AuthEnv) {
  const token = cookieValue(request);
  if (token) {
    const tokenHash = await sha256Hex(`session:${token}`);
    await env.DB.prepare("DELETE FROM partner_sessions WHERE token_hash = ?1").bind(tokenHash).run().catch(() => undefined);
  }
  return json({ ok: true }, { headers: { "set-cookie": sessionCookie("", 0) } });
}

export async function handleAuthRequest(request: Request, env: AuthEnv) {
  const pathname = new URL(request.url).pathname;
  if (pathname === "/api/auth/status" && request.method === "GET") return statusRoute(env);
  if (pathname === "/api/auth/setup" && request.method === "POST") return setupRoute(request, env);
  if (pathname === "/api/auth/login" && request.method === "POST") return loginRoute(request, env);
  if (pathname === "/api/auth/logout" && request.method === "POST") return logoutRoute(request, env);
  if (pathname.startsWith("/api/auth/")) return new Response("Method Not Allowed", { status: 405 });
  return null;
}

export { loginPage };
