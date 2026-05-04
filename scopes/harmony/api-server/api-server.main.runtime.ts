import type { CLIMain } from '@teambit/cli';
import { CLIAspect, MainRuntime } from '@teambit/cli';
import { Port } from '@teambit/toolbox.network.get-port';
import fs from 'fs-extra';
import crypto from 'crypto';
import expressFactory from 'express';
import type { ExpressMain, Middleware, Request, Response, NextFunction } from '@teambit/express';
import { ExpressAspect } from '@teambit/express';
import type { Logger, LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import type { LanesMain } from '@teambit/lanes';
import { LanesAspect } from '@teambit/lanes';
import type { RemoveMain } from '@teambit/remove';
import { RemoveAspect } from '@teambit/remove';
import type { SnappingMain } from '@teambit/snapping';
import { SnappingAspect } from '@teambit/snapping';
import type { GeneratorMain } from '@teambit/generator';
import { GeneratorAspect } from '@teambit/generator';
import type { ComponentCompareMain } from '@teambit/component-compare';
import { ComponentCompareAspect } from '@teambit/component-compare';
import type { ComponentLogMain } from '@teambit/component-log';
import { ComponentLogAspect } from '@teambit/component-log';
import type { WatcherMain } from '@teambit/watcher';
import { WatcherAspect } from '@teambit/watcher';
import type { ConfigMain } from '@teambit/config';
import { ConfigAspect } from '@teambit/config';
import type { ExportMain } from '@teambit/export';
import { ExportAspect } from '@teambit/export';
import type { CheckoutMain } from '@teambit/checkout';
import { CheckoutAspect } from '@teambit/checkout';
import type { InstallMain } from '@teambit/install';
import { InstallAspect } from '@teambit/install';
import type { ImporterMain } from '@teambit/importer';
import { ImporterAspect } from '@teambit/importer';
import type { Component, ComponentMain } from '@teambit/component';
import { ComponentAspect } from '@teambit/component';
import type { Workspace } from '@teambit/workspace';
import { WorkspaceAspect } from '@teambit/workspace';
import { sendEventsToClients } from '@teambit/harmony.modules.send-server-sent-events';
import cors from 'cors';
import { createProxyMiddleware, fixRequestBody } from 'http-proxy-middleware';
import { ApiServerAspect } from './api-server.aspect';
import { CLIRoute } from './cli.route';
import { ServerCmd } from './server.cmd';
import { IDERoute } from './ide.route';
import { APIForIDE } from './api-for-ide';
import { SSEEventsRoute } from './sse-events.route';
import { join } from 'path';
import { execSync } from 'child_process';
import { CLIRawRoute } from './cli-raw.route';
import type { ApplicationMain } from '@teambit/application';
import { ApplicationAspect } from '@teambit/application';
import type { DeprecationMain } from '@teambit/deprecation';
import { DeprecationAspect } from '@teambit/deprecation';
import type { EnvsMain } from '@teambit/envs';
import { EnvsAspect } from '@teambit/envs';
import { DEFAULT_AUTH_TYPE, Http } from '@teambit/scope.network';
import { getSymphonyUrl } from '@teambit/legacy.constants';
import type { GraphMain } from '@teambit/graph';
import { GraphAspect } from '@teambit/graph';
import type { ScopeMain } from '@teambit/scope';
import { ScopeAspect } from '@teambit/scope';
import type { SchemaMain } from '@teambit/schema';
import { SchemaAspect } from '@teambit/schema';

export class ApiServerMain {
  private serverToken?: string;

  constructor(
    private workspace: Workspace,
    private logger: Logger,
    private express: ExpressMain,
    private watcher: WatcherMain,
    private installer: InstallMain,
    private importer: ImporterMain
  ) {}

  async runApiServer(options: { port: number; compile: boolean }) {
    if (!this.workspace) {
      throw new Error(`unable to run bit-server, the current directory ${process.cwd()} is not a workspace`);
    }

    this.workspace.registerOnComponentChange(
      async (
        component: Component,
        files: string[], // os absolute paths
        removedFiles?: string[] // os absolute paths
      ) => {
        sendEventsToClients('onComponentChange', {
          id: component.id.toStringWithoutVersion(),
          files,
          removedFiles,
        });
      }
    );

    this.workspace.registerOnBitmapChange(async () => {
      const lastModifiedTimestamp = await this.workspace.bitMap.getLastModifiedBitmapThroughBit();
      const secondsPassedSinceLastModified = lastModifiedTimestamp && (Date.now() - lastModifiedTimestamp) / 1000;
      if (secondsPassedSinceLastModified && secondsPassedSinceLastModified > 1) {
        // changes by bit were done more than a second ago, so probably this .bitmap change was done by "git pull"
        this.logger.debug(
          `running import because we assume the .bitmap file has changed due to "git pull", last time it was modified by bit was ${secondsPassedSinceLastModified} seconds ago`
        );
        await this.importer.importCurrentObjects();
      }
      sendEventsToClients('onBitmapChange', {});
    });

    this.workspace.registerOnWorkspaceConfigChange(async () => {
      sendEventsToClients('onWorkspaceConfigChange', {});
    });

    this.workspace.scope.registerOnPostExport(async () => {
      sendEventsToClients('onPostExport', {});
    });

    this.installer.registerPostInstall(async () => {
      sendEventsToClients('onPostInstall', {});
    });

    await this.watcher.watch({
      preCompile: false,
      compile: options.compile,
    });

    const port = options.port || (await this.getRandomPort());

    // Generate a per-server auth token and persist it to a 0600 file before
    // any HTTP request can be handled. Clients (e.g. the bit-vscode extension)
    // read it from <workspace.scope.path>/server-token.txt and send it as
    // `Authorization: Bearer <token>`. See createAuthMiddleware below.
    this.writeServerToken();

    // Create the app *before* express.createApp registers routes, so the auth
    // middleware runs before bodyParser — unauthenticated requests can't
    // trigger large-body parsing. CORS is registered before auth so 401
    // responses still carry CORS headers; otherwise browser-based clients
    // (bit-vscode) see a misleading CORS failure instead of the JSON 401.
    // The host-check middleware runs first to reject DNS-rebinding attacks
    // (where a malicious page resolves attacker.example to 127.0.0.1).
    const app = expressFactory();
    app.use(this.createHostCheckMiddleware());
    app.use(
      cors({
        origin(origin, callback) {
          callback(null, true);
        },
        credentials: true,
      })
    );
    app.use(this.createAuthMiddleware());
    this.express.createApp(app);
    const proxyHeaders = {
      Authorization: `${DEFAULT_AUTH_TYPE} ${Http.getToken()}`,
      origin: '',
      'user-agent': 'bit-vscode-proxy',
    };
    const symphonyUrl = getSymphonyUrl();
    app.use(
      '/api/cloud-graphql',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      createProxyMiddleware({
        target: `${symphonyUrl}/graphql`,
        changeOrigin: true,
        headers: proxyHeaders,
        on: {
          error: (err, req, res) => {
            this.logger.error('graphql cloud proxy error', err);
            // @ts-ignore
            res.writeHead(500, {
              'Content-Type': 'text/plain',
            });
            res.end('Something went wrong with the proxy server of bit cloud graphql');
          },
          proxyReq: fixRequestBody,
        },
      })
    );

    app.use(
      '/api/cloud-rest',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      createProxyMiddleware({
        target: `${symphonyUrl}`,
        changeOrigin: true,
        headers: proxyHeaders,
        on: {
          proxyRes: (proxyRes) => {
            proxyRes.headers['Access-Control-Allow-Credentials'] = 'true';
          },
          error: (err, req, res) => {
            this.logger.error('rest cloud proxy error', err);
            // @ts-ignore
            res.writeHead(500, {
              'Content-Type': 'text/plain',
            });
            res.end('Something went wrong with the proxy server of bit cloud rest');
          },
          proxyReq: fixRequestBody,
        },
      })
    );

    app.use(
      '/websocket-server/subscriptions',
      createProxyMiddleware({
        on: {
          proxyReqWs: (proxyReq) => {
            Object.entries(proxyHeaders).forEach(([key, value]) => {
              proxyReq.setHeader(key, value);
            });
          },
          error: (err) => {
            this.logger.error('websocket cloud proxy error', err);
          },
        },
        pathFilter: '/',
        target: symphonyUrl,
        ws: true,
        changeOrigin: true,
      })
    );

    // Bind to loopback only — never accept connections from the LAN. Clients
    // are expected to use 127.0.0.1 (or localhost, which resolves to it).
    const server = await app.listen(port, '127.0.0.1');

    return new Promise((resolve, reject) => {
      server.on('error', (err) => {
        reject(err);
      });
      server.on('listening', () => {
        // important! if you change the message here, change it also in server-forever.ts and also in the vscode extension.
        this.logger.consoleSuccess(`Bit Server is listening on port ${port}`);
        this.writeUsedPort(port);
        this.startParentProcessMonitor();
        resolve(port);
      });
    });
  }

  writeUsedPort(port: number) {
    const filePath = this.getServerPortFilePath();
    fs.writeFileSync(filePath, port.toString(), { mode: 0o600 });
  }

  /**
   * Generate a fresh per-server bearer token and persist it to a 0600 file.
   * Clients (e.g. the bit-vscode extension) read this file and send the token
   * as `Authorization: Bearer <token>` on every request.
   *
   * Backwards compatibility: clients that don't yet know about this file (older
   * extension versions) won't send the header and will receive 401 with a
   * message pointing them at the upgrade. Old bit-server versions don't write
   * this file, so a new client checking for it gracefully falls back to no
   * auth header — meaning a NEW extension keeps working against an OLD
   * bit-server.
   */
  private writeServerToken() {
    const token = crypto.randomBytes(32).toString('hex');
    const filePath = this.getServerTokenFilePath();
    fs.writeFileSync(filePath, token, { mode: 0o600 });
    // Node's `mode` write option is only honored when the file is created.
    // chmod explicitly so a pre-existing file with broader permissions gets
    // tightened to 0600.
    fs.chmodSync(filePath, 0o600);
    this.serverToken = token;
  }

  private getServerTokenFilePath() {
    return join(this.workspace.scope.path, 'server-token.txt');
  }

  /**
   * Host-header check: only accept requests targeting a loopback hostname.
   * Defends against DNS-rebinding attacks where a malicious page on
   * `evil.example` flips DNS to 127.0.0.1 — the browser sends `Host:
   * evil.example`, which we reject with 403 here.
   *
   * The server already listens on 127.0.0.1 only, so any request reaching us
   * arrived via loopback. The remaining concern is the *named* origin the
   * browser thinks it's talking to.
   */
  private createHostCheckMiddleware(): Middleware {
    const allowed = new Set(['localhost', '127.0.0.1', '::1']);
    return (req: Request, res: Response, next: NextFunction) => {
      const hostHeader = req.headers.host || '';
      // Parse hostname from "host:port". IPv6 may be bracketed: "[::1]:1234"
      // → "::1"; IPv4 / hostname is plain: "127.0.0.1:1234" → "127.0.0.1".
      const match = hostHeader.match(/^\[([^\]]+)\]|^([^:]+)/);
      const host = match ? match[1] || match[2] : '';
      if (!allowed.has(host)) {
        this.logger.debug(`api-server: rejected non-loopback Host header: ${hostHeader}`);
        res.status(403).end();
        return;
      }
      return next();
    };
  }

  /**
   * Authentication middleware: requires `Authorization: Bearer <serverToken>`
   * on every request except OPTIONS preflight (handled by cors) and the
   * unauthenticated `/api/_health` liveness probe.
   *
   * For GET requests — specifically WebSocket upgrades and browser-native
   * EventSource (SSE) connections — the underlying APIs cannot set custom
   * headers from JavaScript. The token is therefore also accepted as a
   * `?token=` query parameter on GET requests. We strip it from `req.url`
   * before downstream processing so it never reaches the upstream Bit
   * Cloud proxy or our own logs. POST/PUT/DELETE always require the
   * Authorization header — they can set it.
   *
   * Runs before bodyParser so unauthenticated requests can't trigger
   * large-body parsing.
   */
  private createAuthMiddleware(): Middleware {
    return (req: Request, res: Response, next: NextFunction) => {
      if (req.method === 'OPTIONS') return next();
      // Use req.path (not req.url) so query strings don't bypass the
      // health-check exemption — e.g. /api/_health?cache-buster=1.
      if (req.path === '/api/_health') return next();

      const provided = parseBearerToken(req.headers.authorization);
      let authorized = !!this.serverToken && provided === this.serverToken;

      if (!authorized && this.serverToken && req.method === 'GET') {
        const queryIdx = req.url.indexOf('?');
        if (queryIdx >= 0) {
          const params = new URLSearchParams(req.url.slice(queryIdx + 1));
          if (params.get('token') === this.serverToken) {
            authorized = true;
            params.delete('token');
            const remaining = params.toString();
            req.url = req.url.slice(0, queryIdx) + (remaining ? `?${remaining}` : '');
          }
        }
      }

      if (!authorized) {
        this.logger.debug(`api-server: rejected unauthenticated request to ${req.path}`);
        res.status(401).jsonp({
          error: 'unauthorized',
          message:
            'This bit-server requires authentication. Please upgrade your bit VS Code extension to the latest version.',
        });
        return;
      }
      return next();
    };
  }

  /**
   * Monitor the parent process (typically VSCode) and shut down if it dies.
   *
   * On Unix-like systems (macOS, Linux), when a parent process dies, orphaned children are
   * re-parented to PID 1 (init/launchd). By watching for `process.ppid` changing from
   * the original value to 1, we can detect that the parent exited and proactively
   * shut down the bit server to avoid leaving stale background processes running.
   *
   * Note: This orphan detection does not work on Windows, as Windows does not re-parent
   * processes to PID 1. On Windows, this method only logs the parent process info at startup.
   */
  private startParentProcessMonitor() {
    const originalPpid = process.ppid;

    // Log parent process info at startup
    const parentInfo = this.getProcessInfo(originalPpid);
    this.logger.debug(
      `bit server started. PID: ${process.pid}, Parent PID: ${originalPpid}, Parent command: ${parentInfo}`
    );

    // Skip orphan detection on Windows - PPID doesn't change to 1 when parent dies
    if (process.platform === 'win32') {
      return;
    }

    const checkInterval = 5000; // Check every 5 seconds
    const intervalId = setInterval(() => {
      const currentPpid = process.ppid;
      // If PPID changed to 1, our parent (e.g., VSCode) died and we were re-parented to init
      if (currentPpid === 1 && originalPpid !== 1) {
        this.logger.debug(
          `Parent process died (was PID ${originalPpid}: ${parentInfo}). Current PPID is now 1 (init/launchd). Shutting down bit server.`
        );
        clearInterval(intervalId);
        process.exit(0);
      }
    }, checkInterval);

    // Don't let this interval keep the process alive if everything else is done
    intervalId.unref();
  }

  /**
   * Get the command/path of a process by its PID.
   */
  private getProcessInfo(pid: number): string {
    try {
      if (process.platform === 'win32') {
        // Windows: use PowerShell Get-CimInstance (WMIC is deprecated/removed on modern Windows)
        const psCommand = `Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' | Select-Object -ExpandProperty CommandLine`;
        const output = execSync(`powershell.exe -NoProfile -Command "${psCommand}"`, {
          encoding: 'utf8',
          timeout: 2000,
        });
        return output.trim() || 'unknown';
      } else {
        // macOS/Linux: use ps
        const output = execSync(`ps -o command= -p ${pid}`, { encoding: 'utf8', timeout: 2000 });
        return output.trim() || 'unknown';
      }
    } catch {
      return 'unknown (process may have exited)';
    }
  }

  async getRandomPort() {
    const startingPort = 4000; // we prefer to have the ports between 4000 and 4999.
    // randomInt(min, max) returns a uniformly random int in [min, max).
    const randomNumber = crypto.randomInt(startingPort, 5000);
    const port = await Port.getPort(randomNumber, 65500);
    return port;
  }

  async getExistingUsedPort(): Promise<number | undefined> {
    const filePath = this.getServerPortFilePath();
    try {
      const fileContent = await fs.readFile(filePath, 'utf8');
      return parseInt(fileContent, 10);
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return undefined;
      }
      throw err;
    }
  }

  private getServerPortFilePath() {
    return join(this.workspace.scope.path, 'server-port.txt');
  }

  static dependencies = [
    CLIAspect,
    WorkspaceAspect,
    LoggerAspect,
    ExpressAspect,
    WatcherAspect,
    SnappingAspect,
    LanesAspect,
    InstallAspect,
    ExportAspect,
    CheckoutAspect,
    ComponentLogAspect,
    ImporterAspect,
    ComponentCompareAspect,
    GeneratorAspect,
    RemoveAspect,
    ConfigAspect,
    ApplicationAspect,
    DeprecationAspect,
    EnvsAspect,
    GraphAspect,
    ScopeAspect,
    ComponentAspect,
    SchemaAspect,
  ];
  static runtime = MainRuntime;
  static async provider([
    cli,
    workspace,
    loggerMain,
    express,
    watcher,
    snapping,
    lanes,
    installer,
    exporter,
    checkout,
    componentLog,
    importer,
    componentCompare,
    generator,
    remove,
    config,
    application,
    deprecation,
    envs,
    graph,
    scope,
    component,
    schema,
  ]: [
    CLIMain,
    Workspace,
    LoggerMain,
    ExpressMain,
    WatcherMain,
    SnappingMain,
    LanesMain,
    InstallMain,
    ExportMain,
    CheckoutMain,
    ComponentLogMain,
    ImporterMain,
    ComponentCompareMain,
    GeneratorMain,
    RemoveMain,
    ConfigMain,
    ApplicationMain,
    DeprecationMain,
    EnvsMain,
    GraphMain,
    ScopeMain,
    ComponentMain,
    SchemaMain,
  ]) {
    const logger = loggerMain.createLogger(ApiServerAspect.id);
    const apiServer = new ApiServerMain(workspace, logger, express, watcher, installer, importer);
    cli.register(new ServerCmd(apiServer));

    const apiForIDE = new APIForIDE(
      workspace,
      snapping,
      lanes,
      installer,
      exporter,
      checkout,
      componentLog,
      componentCompare,
      generator,
      remove,
      config,
      application,
      deprecation,
      envs,
      graph,
      scope,
      component,
      schema,
      logger
    );
    const cliRoute = new CLIRoute(logger, cli, apiForIDE);
    const cliRawRoute = new CLIRawRoute(logger, cli, apiForIDE);
    const ideRoute = new IDERoute(logger, apiForIDE);
    const sseEventsRoute = new SSEEventsRoute(logger, cli);
    // register only when the workspace is available. don't register this on a remote-scope, for security reasons.
    if (workspace) {
      express.register([cliRoute, cliRawRoute, ideRoute, sseEventsRoute]);
    }

    return apiServer;
  }
}

ApiServerAspect.addRuntime(ApiServerMain);

/**
 * Extract the token from an `Authorization: Bearer <token>` header.
 * Lenient on scheme casing and surrounding whitespace so a slightly
 * non-canonical client header doesn't get rejected.
 */
function parseBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const match = header.match(/^\s*Bearer\s+(\S+)\s*$/i);
  return match?.[1];
}

export default ApiServerMain;
