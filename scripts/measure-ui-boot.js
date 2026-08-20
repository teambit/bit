#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Workspace UI boot-sequence measurement harness.
 *
 * Answers the two questions a "the workspace loads instantly" change has to keep answering:
 *   1. how long is the user looking at nothing?  (first paint)
 *   2. is a wrong state ever shown on the way?   (the "create your first component" blank state
 *      flashing while the workspace query is still in flight)
 *
 * Both were regressions that source review could not catch - they only exist in a real bundle in a
 * real browser - so this drives headless Chrome over CDP and samples the DOM every animation frame.
 *
 * Usage:
 *   bit start --port 3000            # in the workspace under test, then:
 *   node scripts/measure-ui-boot.js [options]
 *
 * Options:
 *   --url=<url>          page to measure (default: http://localhost:3000/)
 *   --runs=<n>           measured runs, median is reported (default: 3)
 *   --settle=<ms>        how long to watch each run (default: 12000)
 *   --budget-paint=<ms>  fail if median first paint exceeds this (default: 400)
 *   --chrome=<path>      Chrome binary (default: the macOS/Linux standard locations)
 *   --json=<path>        also write the raw results as JSON to this path
 *
 * Exit code is non-zero when a budget is breached or a blank-state frame is observed, so this can
 * be wired into CI as a guard. It needs Chrome and a *built* UI bundle, so it is a local/nightly
 * check rather than something to put in the per-PR path.
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

// Sampled every animation frame in the page. `module__` is the hashed CSS-modules prefix every real
// UI node carries, which is what distinguishes the mounted app from the static boot shell in the
// HTML (whose classes are plain `bit-boot-*`).
const PROBE_SOURCE = `
  window.__bitBoot = { first: {}, states: [] };
  (function () {
    var mark = function (key) {
      if (window.__bitBoot.first[key] === undefined) window.__bitBoot.first[key] = Math.round(performance.now());
    };
    new PerformanceObserver(function (list) {
      for (var i = 0; i < list.getEntries().length; i++) {
        var entry = list.getEntries()[i];
        if (entry.name === 'first-contentful-paint') mark('fcp');
        if (entry.name === 'first-paint') mark('firstPaint');
      }
    }).observe({ type: 'paint', buffered: true });

    var tick = function () {
      var text = document.body ? document.body.innerText : '';
      var shell = !!document.getElementById('bit-boot');
      var blank = text.indexOf('first component') !== -1;
      var appNodes = document.querySelectorAll('[class*="module__"]').length;

      if (shell) mark('bootShell');
      if (blank) mark('blankState');
      if (appNodes > 20) mark('app');

      var state = shell ? 'boot-shell' : blank ? 'BLANK-STATE' : appNodes > 20 ? 'app' : 'empty';
      var last = window.__bitBoot.states[window.__bitBoot.states.length - 1];
      if (!last || last.state !== state) window.__bitBoot.states.push({ state: state, t: Math.round(performance.now()) });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })();
`;

function parseArgs(argv) {
  const opts = {
    url: 'http://localhost:3000/',
    runs: 3,
    settle: 12000,
    budgetPaint: 400,
    chrome: CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate)),
    json: undefined,
  };
  for (const arg of argv.slice(2)) {
    // split on the *first* `=` only - a url value carries its own (`?theme=light`)
    const eq = arg.indexOf('=');
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const value = eq === -1 ? '' : arg.slice(eq + 1);
    if (flag === '--url') opts.url = value;
    else if (flag === '--runs') opts.runs = Number(value);
    else if (flag === '--settle') opts.settle = Number(value);
    else if (flag === '--budget-paint') opts.budgetPaint = Number(value);
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
  // `ws` ships with the repo's dependencies; requiring it lazily keeps `--help`-style usage working
  // in a checkout that has not installed yet.
  // eslint-disable-next-line import/no-extraneous-dependencies, global-require
  const WebSocket = require('ws');
  const socket = new WebSocket(wsUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  const pending = new Map();
  let nextId = 0;

  socket.on('message', (raw) => {
    const message = JSON.parse(raw);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message.result);
      pending.delete(message.id);
    }
  });

  const ready = new Promise((resolve) => socket.on('open', resolve));
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++nextId;
      pending.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });

  return { ready, send, close: () => socket.close() };
}

async function measureOnce(session, opts) {
  await session.send('Page.enable');
  await session.send('Runtime.enable');
  await session.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await session.send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE_SOURCE });
  await session.send('Page.navigate', { url: opts.url });
  await new Promise((resolve) => setTimeout(resolve, opts.settle));

  const result = await session.send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.__bitBoot)',
    returnByValue: true,
  });
  return JSON.parse(result.result.value);
}

function median(values) {
  const sorted = values.filter((value) => typeof value === 'number').sort((a, b) => a - b);
  if (!sorted.length) return undefined;
  return sorted[Math.floor(sorted.length / 2)];
}

function format(ms) {
  return ms === undefined ? 'n/a' : `${ms}ms`;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (!opts.chrome) throw new Error(`no chrome binary found, pass --chrome=<path>. tried:\n  ${CHROME_CANDIDATES.join('\n  ')}`);

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bit-ui-boot-'));
  const port = 9222;
  const chrome = spawn(
    opts.chrome,
    ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`, 'about:blank'],
    { stdio: 'ignore' }
  );

  const runs = [];
  try {
    await waitForDevtools(port);
    for (let run = 0; run < opts.runs; run += 1) {
      const targets = await httpJson(port, '/json/list');
      const page = targets.find((target) => target.type === 'page');
      const session = connect(page.webSocketDebuggerUrl);
      await session.ready;
      runs.push(await measureOnce(session, opts));
      session.close();
    }
  } finally {
    // wait for chrome to actually exit before removing its profile, otherwise it is still writing
    // into the directory and the rmdir races it (ENOTEMPTY)
    const exited = new Promise((resolve) => chrome.once('exit', resolve));
    chrome.kill();
    await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // a leftover temp profile is not worth failing a measurement over
    }
  }

  const paint = median(runs.map((run) => run.first.firstPaint ?? run.first.fcp));
  const shell = median(runs.map((run) => run.first.bootShell));
  const app = median(runs.map((run) => run.first.app));
  const blankRuns = runs.filter((run) => run.first.blankState !== undefined);

  console.log(`\nurl: ${opts.url}   runs: ${opts.runs} (median)\n`);
  console.log(`  first paint        ${format(paint)}   (budget ${opts.budgetPaint}ms)`);
  console.log(`  boot shell visible ${format(shell)}`);
  console.log(`  app mounted        ${format(app)}`);
  console.log(`  blank-state frames ${blankRuns.length}/${runs.length} runs`);
  console.log(`\n  state timeline (run 1): ${runs[0].states.map((s) => `${s.state}@${s.t}ms`).join(' -> ')}\n`);

  if (opts.json) {
    fs.writeFileSync(opts.json, JSON.stringify({ url: opts.url, runs }, null, 2));
    console.log(`  raw results written to ${opts.json}\n`);
  }

  const failures = [];
  if (paint === undefined) failures.push('no paint was recorded - is the UI server running?');
  else if (paint > opts.budgetPaint) failures.push(`first paint ${paint}ms exceeds the ${opts.budgetPaint}ms budget`);
  if (blankRuns.length) failures.push(`the "first component" blank state was rendered in ${blankRuns.length} run(s)`);

  if (failures.length) {
    console.error(`FAIL:\n  - ${failures.join('\n  - ')}\n`);
    process.exit(1);
  }
  console.log('PASS\n');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
