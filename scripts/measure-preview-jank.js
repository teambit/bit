#!/usr/bin/env node
/**
 * Preview scrolling measurement harness.
 *
 * Answers the question a throughput number cannot: does the workspace grid *feel* slow while you
 * scroll it? Cumulative script time says nothing about whether the page was responsive, so this
 * reports what a user actually notices - how long the main thread was blocked, how many frames were
 * dropped, and how many stalls crossed the threshold where a scroll visibly stutters.
 *
 * It also samples what accumulates: live preview iframes (each one a JS realm that booted the env's
 * preview runtime), websockets, heap and requests, once per scroll step. Growth there is what turns
 * a smooth grid into a stuttering one as you scroll further.
 *
 * Usage:
 *   bit start --port 3007            # in the workspace under test, then:
 *   node scripts/measure-preview-jank.js [options]
 *
 * Options:
 *   --url=<url>            page to measure (default: http://localhost:3007/)
 *   --steps=<n>            scroll samples for the accumulation table (default: 8)
 *   --step-px=<n>          pixels per scroll step (default: 900)
 *   --settle=<ms>          how long to let the page load before measuring (default: 25000)
 *   --budget-blocked=<pct> fail if the main thread is blocked more than this (default: 15)
 *   --chrome=<path>        Chrome binary (default: the macOS/Linux standard locations)
 *   --json=<path>          also write the raw results as JSON to this path
 *
 * Compare a grid that mounts previews against the same grid without them: the no-previews case is
 * the target, and on the workspace this was developed against it measures 0 long tasks and 0%
 * blocked. Exit code is non-zero when the blocked budget is breached.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

// long tasks are the standard "the page froze" signal; the rAF trace gives dropped frames, which is
// what a stutter looks like from the user's side
const PROBE_SOURCE = `
  window.__bitJank = { long: [], frames: [], started: 0, sockets: 0, requests: 0 };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__bitJank.long.push(Math.round(entry.duration));
  }).observe({ entryTypes: ['longtask'] });
  (function () {
    var last = performance.now();
    function tick(now) {
      window.__bitJank.frames.push(Math.round(now - last));
      last = now;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  })();
`;

function parseArgs(argv) {
  const opts = {
    url: 'http://localhost:3007/',
    steps: 8,
    stepPx: 900,
    settle: 25000,
    budgetBlocked: 15,
    chrome: CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate)),
    json: undefined,
  };
  for (const arg of argv.slice(2)) {
    // split on the first `=` only - a url value carries its own
    const eq = arg.indexOf('=');
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const value = eq === -1 ? '' : arg.slice(eq + 1);
    if (flag === '--url') opts.url = value;
    else if (flag === '--steps') opts.steps = Number(value);
    else if (flag === '--step-px') opts.stepPx = Number(value);
    else if (flag === '--settle') opts.settle = Number(value);
    else if (flag === '--budget-blocked') opts.budgetBlocked = Number(value);
    else if (flag === '--chrome') opts.chrome = value;
    else if (flag === '--json') opts.json = value;
    else throw new Error(`unknown option: ${flag}`);
  }
  return opts;
}

function httpJson(port, urlPath) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: urlPath }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve(JSON.parse(body)));
      })
      .on('error', reject);
  });
}

async function waitForDevtools(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await httpJson(port, '/json/version');
    } catch {
      if (Date.now() > deadline) throw new Error('chrome did not expose the devtools endpoint in time');
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

function connect(wsUrl) {
  const WebSocket = require('ws');
  const socket = new WebSocket(wsUrl, { perMessageDeflate: false, maxPayload: 512 * 1024 * 1024 });
  const pending = new Map();
  const counters = { sockets: 0, requests: 0, bytes: 0 };
  let nextId = 0;

  socket.on('message', (raw) => {
    const message = JSON.parse(raw);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message.result);
      pending.delete(message.id);
      return;
    }
    if (message.method === 'Network.webSocketCreated') counters.sockets += 1;
    if (message.method === 'Network.requestWillBeSent') counters.requests += 1;
    if (message.method === 'Network.loadingFinished') counters.bytes += message.params.encodedDataLength || 0;
  });

  const ready = new Promise((resolve) => socket.on('open', resolve));
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++nextId;
      pending.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });

  return { ready, send, counters, close: () => socket.close() };
}

const metric = (metrics, name) => metrics?.metrics?.find((m) => m.name === name)?.value ?? 0;

async function sample(session, counters) {
  const perf = await session.send('Performance.getMetrics');
  const dom = await session.send('Runtime.evaluate', {
    expression: 'JSON.stringify({ iframes: document.querySelectorAll("iframe").length })',
    returnByValue: true,
  });
  const { iframes } = JSON.parse(dom.result.value || '{}');
  return {
    iframes,
    sockets: counters.sockets,
    requests: counters.requests,
    mb: +(counters.bytes / 1048576).toFixed(0),
    heapMb: +(metric(perf, 'JSHeapUsedSize') / 1048576).toFixed(0),
    scriptS: +metric(perf, 'ScriptDuration').toFixed(1),
  };
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.chrome)
    throw new Error(`no chrome binary found, pass --chrome=<path>. tried:\n  ${CHROME_CANDIDATES.join('\n  ')}`);

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-preview-jank-'));
  const port = 9222;
  const chrome = spawn(
    opts.chrome,
    ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`, 'about:blank'],
    { stdio: 'ignore' }
  );

  let result;
  try {
    await waitForDevtools(port);
    const targets = await httpJson(port, '/json/list');
    const page = targets.find((target) => target.type === 'page');
    const session = connect(page.webSocketDebuggerUrl);
    await session.ready;

    await session.send('Page.enable');
    await session.send('Network.enable');
    await session.send('Performance.enable');
    await session.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await session.send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE_SOURCE });
    await session.send('Page.navigate', { url: opts.url });
    await new Promise((resolve) => setTimeout(resolve, opts.settle));

    // accumulation: what is still alive as you travel further through the grid
    const steps = [{ label: 'initial', ...(await sample(session, session.counters)) }];
    for (let i = 1; i <= opts.steps; i += 1) {
      await session.send('Runtime.evaluate', {
        expression: `(function(){var el=document.scrollingElement||document.documentElement;
          var sc=[].slice.call(document.querySelectorAll('*')).filter(function(n){
            return n.scrollHeight>n.clientHeight+200&&/auto|scroll/.test(getComputedStyle(n).overflowY);})[0]||el;
          sc.scrollBy(0, ${opts.stepPx}); })()`,
      });
      await new Promise((resolve) => setTimeout(resolve, 2500));
      steps.push({ label: `scroll ${i}`, ...(await sample(session, session.counters)) });
    }

    // responsiveness: a continuous wheel gesture, measured the way a user experiences it
    await session.send('Runtime.evaluate', {
      expression: 'window.__bitJank.long=[];window.__bitJank.frames=[];window.__bitJank.started=performance.now()',
    });
    for (let i = 0; i < 60; i += 1) {
      await session.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 720, y: 450, deltaX: 0, deltaY: 120 });
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await session.send('Runtime.evaluate', {
      expression: 'window.__bitJank.elapsed = performance.now() - window.__bitJank.started',
    });
    const raw = await session.send('Runtime.evaluate', {
      expression: 'JSON.stringify(window.__bitJank)',
      returnByValue: true,
    });
    const jank = JSON.parse(raw.result.value);
    session.close();

    const long = jank.long || [];
    const frames = (jank.frames || []).filter((f) => f > 0 && f < 5000);
    result = {
      url: opts.url,
      steps,
      elapsedMs: Math.round(jank.elapsed || 0),
      longTasks: long.length,
      blockedMs: long.reduce((n, d) => n + Math.max(0, d - 50), 0),
      worstTaskMs: long.length ? Math.max(...long) : 0,
      framesRendered: frames.length,
      droppedFrames: frames.filter((f) => f > 33).length,
      stutters: frames.filter((f) => f > 100).length,
    };
  } finally {
    // wait for chrome to exit before removing its profile, otherwise the rmdir races it
    const exited = new Promise((resolve) => chrome.once('exit', resolve));
    chrome.kill();
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // a leftover temp profile is not worth failing a measurement over
    }
  }

  const blockedPct = result.elapsedMs ? (result.blockedMs / result.elapsedMs) * 100 : 0;

  console.log(`\nurl: ${result.url}\n`);
  console.log('  what stays alive as you scroll:');
  console.log('    step        iframes  sockets  requests     MB   heap   script');
  for (const step of result.steps) {
    console.log(
      `    ${step.label.padEnd(11)} ${String(step.iframes).padStart(6)} ${String(step.sockets).padStart(8)}` +
        ` ${String(step.requests).padStart(9)} ${String(step.mb).padStart(6)} ${String(step.heapMb).padStart(5)}MB` +
        ` ${String(step.scriptS).padStart(6)}s`
    );
  }
  console.log(`\n  responsiveness during a 60-tick wheel scroll:`);
  console.log(`    the gesture took       ${(result.elapsedMs / 1000).toFixed(1)}s`);
  console.log(`    long tasks (>50ms)     ${result.longTasks}`);
  console.log(`    main thread blocked    ${result.blockedMs}ms = ${blockedPct.toFixed(0)}% of the gesture`);
  console.log(`    worst single stall     ${result.worstTaskMs}ms`);
  console.log(`    dropped frames (>33ms) ${result.droppedFrames} of ${result.framesRendered}`);
  console.log(`    visible stutters       ${result.stutters}\n`);

  if (opts.json) {
    fs.writeFileSync(opts.json, JSON.stringify(result, null, 2));
    console.log(`  raw results written to ${opts.json}\n`);
  }

  if (blockedPct > opts.budgetBlocked) {
    console.error(
      `FAIL: main thread blocked ${blockedPct.toFixed(0)}% of the gesture, budget is ${opts.budgetBlocked}%\n`
    );
    process.exit(1);
  }
  console.log('PASS\n');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
