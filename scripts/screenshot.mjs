#!/usr/bin/env node
/**
 * Screenshot the web UI from a headless shell.
 *
 * Built for a session with no DISPLAY (`su - user`, CI, a container): drives
 * headless Chrome over CDP using Node's built-in WebSocket, so there is nothing
 * to install. Point it at a running dev server and give it routes.
 *
 *   node scripts/screenshot.mjs --device=p30 /workspaces /agents
 *   node scripts/screenshot.mjs --device=desktop --out=/tmp/shots /contexts
 *   node scripts/screenshot.mjs --device=p30 --pwa --tall /workspaces/x/settings/db
 *
 * Three things about this environment that will waste your afternoon if you
 * do not know them:
 *
 *  1. `/auth/login` is rate limited (5 per 15 min) and the counter survives a
 *     server restart. The token is cached in `--token-cache` and reused.
 *  2. Headless Chrome reports `hover: none` / `pointer: coarse` NO MATTER the
 *     viewport, so pointer-aware CSS always renders its touch branch — row
 *     actions that hide until hover look permanently visible. CDP's
 *     setEmulatedMedia does not cover those features; only the blink-settings
 *     launch flag below does. Desktop presets set it, touch presets do not.
 *  3. Page content scrolls in an INNER container, not the document, so
 *     `captureBeyondViewport` alone does not produce a full-page shot. Use
 *     `--tall` (a very tall viewport) or `--scroll-to=<selector>`.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// hover: none=1 hover=2 · pointer: none=1 coarse=2 fine=4
const FINE_POINTER =
  '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4';

const DEVICES = {
  // The reference phone this UI is tested on.
  p30: { width: 393, height: 851, scale: 2.75, touch: true },
  // Narrowest mainstream phone width — catches overflow p30 hides.
  narrow: { width: 360, height: 780, scale: 3, touch: true },
  tablet: { width: 820, height: 1180, scale: 2, touch: true },
  laptop: { width: 1280, height: 800, scale: 2, touch: false },
  desktop: { width: 1680, height: 1050, scale: 2, touch: false },
};

function parseArgs(argv) {
  const opts = {
    device: 'p30',
    base: process.env.SCREENSHOT_BASE || 'http://127.0.0.1:5199',
    out: process.env.SCREENSHOT_OUT || '/tmp/canvas-shots',
    email: process.env.SCREENSHOT_EMAIL || 'admin@canvas.local',
    password: process.env.SCREENSHOT_PASSWORD || '',
    tokenCache: process.env.SCREENSHOT_TOKEN_CACHE || '/tmp/canvas-shots/.token',
    wait: 4000,
    tall: false,
    pwa: false,
    scrollTo: null,
    routes: [],
  };
  for (const arg of argv) {
    if (arg.startsWith('--device=')) { opts.device = arg.slice(9); }
    else if (arg.startsWith('--base=')) { opts.base = arg.slice(7); }
    else if (arg.startsWith('--out=')) { opts.out = arg.slice(6); }
    else if (arg.startsWith('--wait=')) { opts.wait = Number(arg.slice(7)); }
    else if (arg.startsWith('--scroll-to=')) { opts.scrollTo = arg.slice(12); }
    else if (arg.startsWith('--token-cache=')) { opts.tokenCache = arg.slice(14); }
    else if (arg === '--tall') { opts.tall = true; }
    else if (arg === '--pwa') { opts.pwa = true; }
    else if (arg.startsWith('--')) { throw new Error(`unknown flag ${arg}`); }
    else { opts.routes.push(arg); }
  }
  if (!DEVICES[opts.device]) {
    throw new Error(`unknown device '${opts.device}' (have: ${Object.keys(DEVICES).join(', ')})`);
  }
  if (opts.routes.length === 0) { opts.routes = ['/']; }
  return opts;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const slug = route => (route.replace(/^\/|\/$/g, '').replace(/[^a-z0-9]+/gi, '-') || 'root');

/** Cached because the login route is rate limited far below screenshot cadence. */
async function getToken(opts) {
  try {
    const cached = (await fs.readFile(opts.tokenCache, 'utf8')).trim();
    const exp = JSON.parse(Buffer.from(cached.split('.')[1], 'base64url').toString()).exp;
    if (exp * 1000 > Date.now() + 60_000) { return cached; }
  } catch { /* no usable cache */ }

  if (!opts.password) {
    throw new Error('no cached token and no --password/SCREENSHOT_PASSWORD to log in with');
  }
  const res = await fetch(`${opts.base}/rest/v2/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: opts.email, password: opts.password, strategy: 'auto' }),
  });
  const json = await res.json();
  if (!json?.payload?.token) {
    throw new Error(`login failed: ${JSON.stringify(json).slice(0, 200)}`);
  }
  await fs.mkdir(path.dirname(opts.tokenCache), { recursive: true });
  await fs.writeFile(opts.tokenCache, json.payload.token, { mode: 0o600 });
  return json.payload.token;
}

async function startChrome(device, pwa) {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'canvas-shot-'));
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    `--window-size=${device.width},${device.height}`,
  ];
  if (!device.touch) { args.push(FINE_POINTER); }
  // An installed PWA runs in standalone display-mode, which changes what the
  // app's own `display-mode` media queries and safe-area padding do.
  if (pwa) { args.push('--app=about:blank'); }
  args.push('about:blank');

  const chrome = spawn('/usr/bin/google-chrome', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error(`chrome never reported a debug URL:\n${buf}`)), 20000);
    chrome.stderr.on('data', chunk => {
      buf += chunk;
      const m = buf.match(/ws:\/\/[^\s]+/);
      if (m) { clearTimeout(timer); resolve(m[0]); }
    });
    chrome.on('exit', code => { clearTimeout(timer); reject(new Error(`chrome exited ${code}:\n${buf}`)); });
  });
  return { chrome, wsUrl, userDataDir };
}

/** Minimal CDP client. Node 22 ships a global WebSocket, so this needs no deps. */
class Cdp {
  #ws; #id = 0; #pending = new Map(); #handlers = new Map();
  constructor(ws) {
    this.#ws = ws;
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.#pending.has(msg.id)) {
        const { resolve, reject } = this.#pending.get(msg.id);
        this.#pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.#handlers.get(msg.method) || []) { fn(msg.params); }
      }
    });
  }
  on(method, fn) {
    if (!this.#handlers.has(method)) { this.#handlers.set(method, []); }
    this.#handlers.get(method).push(fn);
  }
  send(method, params = {}, sessionId) {
    const id = ++this.#id;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const device = DEVICES[opts.device];
  await fs.mkdir(opts.out, { recursive: true });

  const token = await getToken(opts);
  const { chrome, wsUrl, userDataDir } = await startChrome(device, opts.pwa);

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', () => reject(new Error('could not open the CDP socket')));
  });
  const cdp = new Cdp(ws);

  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => cdp.send(method, params, sessionId);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    // --tall renders the whole page in one shot: content lives in an inner
    // scroll container, so a tall viewport beats captureBeyondViewport.
    width: device.width,
    height: opts.tall ? 2400 : device.height,
    deviceScaleFactor: device.scale,
    mobile: device.touch,
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: device.touch });

  const problems = [];
  cdp.on('Network.responseReceived', p => {
    if (p.response.status >= 400) { problems.push(`HTTP ${p.response.status} ${p.response.url}`); }
  });
  cdp.on('Runtime.exceptionThrown', p => {
    problems.push(`JS ${p.exceptionDetails?.exception?.description || p.exceptionDetails?.text}`);
  });

  // Seed auth on the app origin before the SPA boots, or it bounces to /login.
  await send('Page.navigate', { url: `${opts.base}/login` });
  await sleep(1200);
  await send('Runtime.evaluate', { expression: `localStorage.setItem('authToken', ${JSON.stringify(token)})` });

  // Optional extra localStorage seeding (JSON object of key -> value), e.g.
  // SCREENSHOT_LOCALSTORAGE='{"doclist:view":"tile"}' to pin a view mode.
  if (process.env.SCREENSHOT_LOCALSTORAGE) {
    const extra = JSON.parse(process.env.SCREENSHOT_LOCALSTORAGE);
    for (const [key, value] of Object.entries(extra)) {
      await send('Runtime.evaluate', { expression: `localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(String(value))})` });
    }
  }

  // SCREENSHOT_LATENCY=<ms> adds round-trip latency to every request — the
  // production front answers in ~2s, and races that never show on a local
  // server (an edit landing while a hydrating fetch is still in flight) do.
  const latency = Number(process.env.SCREENSHOT_LATENCY || 0);
  if (latency > 0) {
    await send('Network.enable');
    await send('Network.emulateNetworkConditions', { offline: false, latency, downloadThroughput: -1, uploadThroughput: -1 });
  }

  for (const route of opts.routes) {
    await send('Page.navigate', { url: `${opts.base}${route}` });
    await sleep(Number(process.env.SCREENSHOT_WAIT || opts.wait));
    if (opts.scrollTo) {
      await send('Runtime.evaluate', {
        expression: `document.querySelector(${JSON.stringify(opts.scrollTo)})?.scrollIntoView({block:'start'})`,
      });
      await sleep(600);
    }
    // Optional JS to run once the route has settled, before the shot — open a
    // drawer, click a tab, dump state. SCREENSHOT_EVAL='document.querySelector(...).click()'
    // Its (awaited) result is printed, so an expression that returns text is a probe.
    if (process.env.SCREENSHOT_EVAL) {
      const { result: ev } = await send('Runtime.evaluate', {
        expression: `(async () => { ${process.env.SCREENSHOT_EVAL} })()`,
        awaitPromise: true,
        returnByValue: true,
      });
      if (ev?.value !== undefined) { console.log('eval:', typeof ev.value === 'string' ? ev.value : JSON.stringify(ev.value)); }
      await sleep(1500);
    }
    // Horizontal overflow is the classic phone bug and is easy to miss by eye.
    const { result } = await send('Runtime.evaluate', {
      expression: `(() => {
        const w = document.documentElement.clientWidth;
        const over = [...document.querySelectorAll('*')]
          .filter(el => el.getBoundingClientRect().right > w + 1)
          .slice(0, 5)
          .map(el => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0, 3).join('.') : ''));
        return JSON.stringify({ scrollW: document.documentElement.scrollWidth, clientW: w, over });
      })()`,
      returnByValue: true,
    });
    const overflow = JSON.parse(result.value || '{}');

    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    const file = path.join(opts.out, `${opts.device}-${slug(route)}.png`);
    await fs.writeFile(file, Buffer.from(data, 'base64'));
    const flag = overflow.scrollW > overflow.clientW ? `  OVERFLOW +${overflow.scrollW - overflow.clientW}px ${overflow.over.join(' ')}` : '';
    console.log(`${file}${flag}`);
  }

  if (problems.length) {
    console.log('\nproblems:');
    for (const p of [...new Set(problems)].slice(0, 15)) { console.log(' -', p.slice(0, 200)); }
  }

  ws.close();
  chrome.kill();
  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
}

main().catch(err => { console.error(err.message); process.exit(1); });
