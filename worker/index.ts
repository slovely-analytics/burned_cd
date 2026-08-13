/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  SURVIVOR_POOL_PASSWORD?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

const ACCESS_COOKIE = "survivor_pool_access";
const ACCESS_MAX_AGE = 60 * 60 * 24 * 30;

function loginPage(message = "") {
  const escapedMessage = message.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character] ?? character);
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Survivor Pool Strategizer · Private access</title><style>html,body{margin:0;min-height:100%;font-family:Arial,Helvetica,sans-serif;background:#f7f8fa;color:#172033}body{display:grid;place-items:center;padding:24px}.card{width:min(100%,420px);padding:32px;background:#fff;border:1px solid #e2e6ec;border-radius:14px;box-shadow:0 18px 40px rgba(24,36,59,.1)}.mark{display:grid;place-items:center;width:38px;height:38px;border-radius:10px;background:#e66942;color:#fff;font-weight:800;font-size:12px}.eyebrow{margin:26px 0 10px;color:#e66942;font-size:10px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase}.title{margin:0;color:#18243b;font-size:31px;line-height:1.05;letter-spacing:-1.2px}.copy{margin:13px 0 25px;color:#6c7587;font-size:14px;line-height:1.6}label{display:block;margin-bottom:7px;color:#6c7587;font-size:11px;font-weight:700}input{width:100%;padding:12px 13px;box-sizing:border-box;border:1px solid #e2e6ec;border-radius:7px;color:#172033;outline:none;font-size:14px}input:focus{border-color:#e66942;box-shadow:0 0 0 3px rgba(230,105,66,.12)}button{width:100%;margin-top:14px;padding:12px 15px;border:0;border-radius:7px;color:#fff;background:#e66942;font-size:12px;font-weight:800;cursor:pointer}.error{min-height:17px;margin-top:12px;color:#b4573a;font-size:11px}</style></head><body><main class="card"><div class="mark">SP</div><p class="eyebrow">Private shared workspace</p><h1 class="title">Pick together.<br>Keep one alive.</h1><p class="copy">Enter the shared passphrase for McLovin and Casual&apos;s Survivor Pool Strategizer.</p><form id="access-form"><label for="password">Shared passphrase</label><input id="password" name="password" type="password" autocomplete="current-password" autofocus required><button type="submit">Enter workspace</button><p class="error" id="error">${escapedMessage}</p></form></main><script>const form=document.getElementById('access-form');const input=document.getElementById('password');const error=document.getElementById('error');form.addEventListener('submit',async(event)=>{event.preventDefault();error.textContent='Checking passphrase…';const response=await fetch('/api/access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:input.value})});if(response.ok){window.location.href='/';return}error.textContent=response.status===401?'That passphrase is not correct.':'The private workspace is not ready yet.';input.select();});</script></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

async function accessToken(password: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`survivor-pool:${password}`));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function cookieValue(request: Request) {
  const cookies = request.headers.get("cookie")?.split(";") ?? [];
  const entry = cookies.find((cookie) => cookie.trim().startsWith(`${ACCESS_COOKIE}=`));
  return entry?.trim().slice(`${ACCESS_COOKIE}=`.length) ?? "";
}

async function accessRoute(request: Request, env: Env) {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!env.SURVIVOR_POOL_PASSWORD) return new Response("Private access is not configured.", { status: 503 });

  const body = (await request.json().catch(() => null)) as { password?: string } | null;
  if (!body?.password || body.password !== env.SURVIVOR_POOL_PASSWORD) {
    return Response.json({ error: "Incorrect passphrase" }, { status: 401 });
  }

  const token = await accessToken(env.SURVIVOR_POOL_PASSWORD);
  return Response.json({ ok: true }, { headers: { "set-cookie": `${ACCESS_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${ACCESS_MAX_AGE}` } });
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/access") return accessRoute(request, env);
    if (!env.SURVIVOR_POOL_PASSWORD) return new Response("Private access is not configured.", { status: 503 });
    if ((await accessToken(env.SURVIVOR_POOL_PASSWORD)) !== cookieValue(request)) return loginPage();

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
