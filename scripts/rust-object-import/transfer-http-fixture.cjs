// Actual compiled scope routes on stable loopback URLs; all backing scopes are disposable.
const http = require('node:http');
const path = require('node:path');
const { createRequire } = require('node:module');
const load = createRequire(path.join(process.argv[2], 'package.json'));
const { FetchRoute } = load('@teambit/scope/dist/routes/fetch.route.js');
const { PutRoute } = load('@teambit/scope/dist/routes/put.route.js');
const { ActionRoute } = load('@teambit/scope/dist/routes/action.route.js');
const { Scope, ScopeComponentsImporter } = load('@teambit/legacy.scope');
const { ComponentID } = load('@teambit/component-id');
const names = JSON.parse(process.argv[3]);
let configurations = {};
const servers = [];
const events = [];
const logger = { debug() {}, info() {}, warn() {}, error() {} };
(async () => {
  const remotes = {};
  for (const name of names) {
    const server = http.createServer(async (req, res) => {
      const config = configurations[name];
      if (!config) {
        res.writeHead(503);
        res.end('fixture has not been configured');
        return;
      }
      res.status = function (status) {
        this.statusCode = status;
        return this;
      };
      res.json = function (value) {
        this.setHeader('content-type', 'application/json');
        this.end(JSON.stringify(value));
      };
      const scope = {
        path: config.path,
        name,
        config: { httpTimeOut: 120000 },
        logger,
        preFetchObjects: { values: () => [] },
        resolveComponentId: async (id) => ComponentID.fromString(id),
      };
      try {
        if (req.method !== 'POST') {
          res.status(404).end();
          return;
        }
        if (req.url === '/api/scope/put') {
          events.push({ scope: name, operation: 'put', pushOptions: JSON.parse(req.headers['push-options'] || '{}') });
          await new PutRoute(scope, { values: () => [] }).middlewares[0](req, res);
          return;
        }
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        req.body = JSON.parse(Buffer.concat(chunks).toString());
        if (req.url === '/api/scope/action') {
          events.push({ scope: name, operation: 'action', name: req.body.name, options: req.body.options });
          if (config.failValidate && req.body.name === 'ExportValidate') {
            res.status(500).json({ message: 'qualification validation failure', code: 'QUALIFICATION_VALIDATE_FAILED' });
            return;
          }
          if (config.failPersist && req.body.name === 'ExportPersist') {
            res.status(500).json({ message: 'qualification persist failure', code: 'QUALIFICATION_PERSIST_FAILED' });
            return;
          }
          await new ActionRoute(scope).middlewares[0](req, res);
        } else if (req.url === '/api/scope/fetch') {
          events.push({ scope: name, operation: 'fetch', ids: req.body.ids, options: req.body.fetchOptions });
          if (config.truncateFetch) {
            res.writeHead(200);
            res.write(Buffer.alloc(512));
            res.destroy();
            return;
          }
          await new FetchRoute(scope, logger).middlewares[0](req, res);
        } else res.status(404).end();
      } catch (error) {
        if (!res.headersSent) res.status(500).json({ message: error.message, code: error.code });
        else res.destroy(error);
      }
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    servers.push(server);
    remotes[name] = `http://127.0.0.1:${server.address().port}`;
  }
  process.send?.({ remotes });
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
process.on('message', (message) => {
  if (message.configure) {
    configurations = message.configure;
    Scope.scopeCache = {};
    ScopeComponentsImporter.instancePerScope = {};
    events.length = 0;
    process.send?.({ configured: true });
  } else if (message.events) process.send?.({ events });
});
process.on('disconnect', () => {
  for (const server of servers) server.close();
});
