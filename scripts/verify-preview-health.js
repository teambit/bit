#!/usr/bin/env node
/**
 * Preview grid health gate.
 *
 * A page can be fast because it is broken: a grid that renders nothing raises no long tasks, and a
 * chunk that fails to load leaves no bytes on the wire. This gate asserts the things a human
 * notices in devtools and a throughput probe cannot:
 *
 *   - no chunk errors or uncaught exceptions in the page or any preview realm
 *     (component-content React warnings are reported separately, not gated)
 *   - no failed same-origin requests (external-origin blocks and the favicon are reported as noise)
 *   - no requests still pending at the end of the window (websockets/EventSource excluded)
 *   - all pooled preview frames actually rendered
 *
 * Run it twice per change: on a virgin browser profile, and across a mid-session recompile with the
 * page open - the second is how a chunk-name rotation or lazy-compilation failure actually bites.
 *
 * Usage:
 *   node scripts/verify-preview-health.js <url> [targetFrames] [settleMs]
 * Requires headless Chrome with --remote-debugging-port=9222 already running.
 */
const http = require('http');
const WebSocket = require('ws');
const get = (p) =>
  new Promise((r, j) =>
    http
      .get({ host: '127.0.0.1', port: 9222, path: p }, (x) => {
        let d = '';
        x.on('data', (c) => (d += c));
        x.on('end', () => r(JSON.parse(d)));
      })
      .on('error', j)
  );
const TARGET = Number(process.argv[3] || 20),
  SETTLE = Number(process.argv[4] || 30000);
(async () => {
  const t = (await get('/json/list')).find((x) => x.type === 'page');
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 2e8 });
  let id = 0;
  const p = new Map();
  const consoleErrors = [];
  const reqs = new Map();
  let wire = 0;
  const send = (m, q = {}, sid) =>
    new Promise((r) => {
      const i = ++id;
      p.set(i, r);
      ws.send(JSON.stringify({ id: i, method: m, params: q, ...(sid ? { sessionId: sid } : {}) }));
    });
  const sessions = new Set();
  ws.on('message', async (raw) => {
    const x = JSON.parse(raw);
    if (x.id && p.has(x.id)) {
      p.get(x.id)(x.result);
      p.delete(x.id);
      return;
    }
    const P = x.params || {};
    switch (x.method) {
      case 'Target.attachedToTarget': {
        const sid = P.sessionId;
        sessions.add(sid);
        await send('Runtime.enable', {}, sid);
        await send('Network.enable', {}, sid);
        await send('Runtime.runIfWaitingForDebugger', {}, sid);
        break;
      }
      case 'Runtime.exceptionThrown':
        consoleErrors.push(
          'exception: ' +
            String(P.exceptionDetails?.exception?.description || P.exceptionDetails?.text || '')
              .split('\n')[0]
              .slice(0, 160)
        );
        break;
      case 'Runtime.consoleAPICalled':
        if (P.type === 'error')
          consoleErrors.push(
            'console.error: ' +
              (P.args || [])
                .map((a) => a.value || a.description || '')
                .join(' ')
                .split('\n')[0]
                .slice(0, 160)
          );
        break;
      case 'Network.requestWillBeSent':
        reqs.set(P.requestId, { url: P.request.url, state: 'pending', type: P.type });
        break;
      case 'Network.responseReceived': {
        const r = reqs.get(P.requestId);
        if (r) {
          r.status = P.response.status;
        }
        break;
      }
      case 'Network.loadingFinished': {
        const r = reqs.get(P.requestId);
        if (r) {
          r.state = 'done';
          wire += P.encodedDataLength || 0;
        }
        break;
      }
      case 'Network.loadingFailed': {
        const r = reqs.get(P.requestId);
        if (r) {
          r.state = 'failed';
          r.error = P.errorText;
          r.canceled = P.canceled;
        }
        break;
      }
      default:
        break;
    }
  });
  await new Promise((r) => ws.on('open', r));
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  const t0 = Date.now();
  await send('Page.navigate', { url: process.argv[2] });
  let all = null;
  for (let i = 0; i < Math.ceil(SETTLE / 250); i++) {
    await new Promise((r) => setTimeout(r, 250));
    const r = await send('Runtime.evaluate', {
      returnByValue: true,
      expression: `(()=>{const h=document.getElementById('bit-preview-canvas');return h?[...h.children].filter(c=>c.style.visibility==='visible').length:0})()`,
    });
    if (all === null && (r.result.value || 0) >= TARGET) {
      all = ((Date.now() - t0) / 1000).toFixed(2);
    }
    if (all !== null && i > all * 4 + 20) break;
  }
  await new Promise((r) => setTimeout(r, 3000));
  const list = [...reqs.values()];
  // infra failures gate hard; external-origin blocks and the favicon are content/headless noise
  const isExternal = (u) => {
    try {
      return new URL(u).origin !== new URL(process.argv[2]).origin;
    } catch {
      return true;
    }
  };
  const failedAll = list.filter((r) => (r.state === 'failed' && !r.canceled) || (r.status && r.status >= 400));
  const failed = failedAll.filter((r) => !isExternal(r.url) && !/favicon\.ico/.test(r.url || ''));
  const failedNoise = failedAll.length - failed.length;
  const stuck = list.filter((r) => r.state === 'pending' && r.type !== 'WebSocket' && r.type !== 'EventSource');
  const chunkErrs = consoleErrors.filter((e) => /ChunkLoadError|Loading chunk/.test(e));
  // react development warnings from component content are reported, not gated
  const infraErrors = consoleErrors.filter(
    (e) =>
      !/Received .%s. for a non-boolean|cannot be a descendant|cannot contain a nested|without an .onChange.|Each child in a list|validateDOMNesting|closing image tag/.test(
        e
      )
  );
  console.log(
    `frames: ${all ?? 'INCOMPLETE'} s to ${TARGET} | wire ${(wire / 1048576).toFixed(1)}MB | requests ${list.length}`
  );
  console.log(
    `console errors: ${consoleErrors.length} (infra: ${infraErrors.length}, chunk: ${chunkErrs.length}, content warnings: ${consoleErrors.length - infraErrors.length})`
  );
  [...new Set(consoleErrors)].slice(0, 5).forEach((e) => console.log('  ', e));
  console.log(`failed requests (same-origin): ${failed.length} (external/favicon noise: ${failedNoise})`);
  failed.slice(0, 5).forEach((r) => console.log('  ', r.status || r.error, (r.url || '').slice(-90)));
  console.log(`stuck-pending requests: ${stuck.length}`);
  stuck.slice(0, 5).forEach((r) => console.log('   pending:', (r.url || '').slice(-90)));
  const pass = all !== null && infraErrors.length === 0 && failed.length === 0 && stuck.length === 0;
  console.log(pass ? 'HEALTH: PASS' : 'HEALTH: FAIL');
  ws.close();
  process.exit(pass ? 0 : 1);
})();
