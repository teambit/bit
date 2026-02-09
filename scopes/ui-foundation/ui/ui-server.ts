import type { ExpressMain } from '@teambit/express';
import type { GraphqlMain } from '@teambit/graphql';
import type { Logger } from '@teambit/logger';
import type { Express } from 'express';
import express from 'express';
import fallback from 'express-history-api-fallback';
import { Port } from '@teambit/toolbox.network.get-port';
import { stripTrailingChar } from '@teambit/toolbox.string.strip-trailing-char';
import type { Server } from 'http';
import httpProxy from 'http-proxy';
import { join } from 'path';
import { rspack } from '@rspack/core';
import type { Configuration as WdsConfiguration } from '@rspack/dev-server';
import { RspackDevServer } from '@rspack/dev-server';
import type { ComponentServer } from '@teambit/bundler';
import { createSsrMiddleware } from './ssr-middleware';
import type { StartPlugin } from './start-plugin';
import type { ProxyEntry, UIRoot } from './ui-root';
import { UIRuntime } from './ui.aspect';
import type { UiMain } from './ui.main.runtime';

import { devConfig } from './rspack/rspack.dev.config';

export type UIServerProps = {
  graphql: GraphqlMain;
  express: ExpressMain;
  ui: UiMain;
  uiRoot: UIRoot;
  uiRootExtension: string;
  logger: Logger;
  publicDir: string;
  startPlugins: StartPlugin[];
};

export type StartOptions = {
  /**
   * Absolute path to the ui bundle (generated during the bit build).
   */
  bundleUiRoot?: string;
  /**
   * port range for the UI server to bind. default is a port range of 4000-4200.
   */
  portRange?: number[] | number;
};

export class UIServer {
  private _app: Express;
  private _server: Server;
  private _proxyRoutes = new Set<string>();

  constructor(
    private graphql: GraphqlMain,
    private expressExtension: ExpressMain,
    private ui: UiMain,
    private uiRoot: UIRoot,
    private uiRootExtension: string,
    private logger: Logger,
    private publicDir: string,
    private plugins: StartPlugin[]
  ) {}

  getName() {
    return this.uiRoot.name;
  }

  private _port = 0;

  get port() {
    return this._port;
  }

  /** the hostname for the server to listen at. Currently statically 'localhost' */
  get host() {
    return 'localhost';
  }

  /** the server listens at this url */
  get fullUrl() {
    const port = this.port !== 80 ? `:${this.port}` : '';
    return `http://${this.host}${port}`;
  }

  get buildOptions() {
    return this.uiRoot.buildOptions;
  }

  /**
   * get the webpack configuration of the UI server.
   */
  async getDevConfig() {
    const aspects = await this.uiRoot.resolveAspects(UIRuntime.name);

    return devConfig(this.uiRoot.path, [await this.ui.generateRoot(aspects, this.uiRootExtension)], this.uiRoot.name);
  }

  private setReady: () => void;
  private startPromise = new Promise<void>((resolve) => (this.setReady = resolve));
  get whenReady() {
    return Promise.all([this.startPromise, ...this.plugins.map((x) => x?.whenReady)]);
  }

  addComponentServerProxy(server: ComponentServer): void {
    const envId = server.context.envRuntime.id;
    const previewRoute = `/preview/${envId}`;
    const hmrRoute = `/_hmr/${envId}`;

    const entries = [
      {
        context: [previewRoute],
        target: `http://${this.host}:${server.port}`,
      },
      {
        context: [hmrRoute],
        target: `ws://${this.host}:${server.port}`,
        ws: true,
      },
    ];

    if (this._proxyRoutes.has(previewRoute) || this._proxyRoutes.has(hmrRoute)) {
      this.logger.debug(`Routes for environment ${envId} already exist, skipping`);
      return;
    }

    try {
      const dynamicProxy = httpProxy.createProxyServer();

      dynamicProxy.on('error', (e) => {
        this.logger.error(e.message);
      });

      // Cache JS/CSS assets in the browser for 120s so subsequent preview iframes
      // reuse the same bundle without re-downloading from the component dev server.
      dynamicProxy.on('proxyRes', (proxyRes, req) => {
        const url = req.url || '';
        if (/\.(js|css)(\?.*)?$/.test(url)) {
          proxyRes.headers['cache-control'] = 'public, max-age=120';
        }
      });

      const wsHandler = (req, socket, head) => {
        try {
          const reqUrl = req.url?.replace(/\?.+$/, '') || '';
          const path = stripTrailingChar(reqUrl, '/');

          const entry = entries.find(
            (proxy) =>
              proxy.ws &&
              proxy.context.some((item) => {
                const itemPath = stripTrailingChar(item, '/');
                return path === itemPath || path.startsWith(itemPath);
              })
          );

          if (!entry) {
            return;
          }

          dynamicProxy.ws(req, socket, head, { target: entry.target });
        } catch (err: any) {
          this.logger.error(`WebSocket handling error for ${envId}: ${err.message}`);
        }
      };

      try {
        this._server.on('upgrade', wsHandler);
      } catch (err: any) {
        this.logger.error(`Failed to register WebSocket handler for ${envId}: ${err.message}`);
      }

      const router = express.Router();

      router.use((req, res) => {
        try {
          const originalUrl = req.originalUrl;
          this.logger.debug(`Proxying request to ${envId}: ${originalUrl}`);
          req.url = originalUrl;
          dynamicProxy.web(req, res, { target: entries[0].target });
        } catch (err: any) {
          this.logger.error(`Error in component router for ${envId}: ${err.message}`);
          if (!res.headersSent) {
            res.status(502).send(`Component server proxy error: ${err.message}`);
          }
        }
      });

      entries.forEach((entry) => {
        entry.context.forEach((route) => {
          try {
            this.logger.debug(`Setting up dynamic HTTP route: ${route}/* -> ${entry.target}`);
            this._proxyRoutes.add(route);
            this._app.use(route, router);

            // Move it to the beginning of the stack for priority
            try {
              const stack = this._app._router.stack;
              const lastMiddleware = stack.pop();
              if (lastMiddleware) {
                stack.unshift(lastMiddleware);
              }
            } catch (stackErr: any) {
              this.logger.error(`Error manipulating middleware stack: ${stackErr.message}`);
            }
          } catch (routeErr: any) {
            this.logger.error(`Error setting up route ${route}: ${routeErr.message}`);
          }
        });
      });
    } catch (err: any) {
      this.logger.error(`Failed to set up component proxy for ${envId}: ${err.message}`);
    }
  }

  private async configureProxy(app: Express, server: Server) {
    const proxyServer = httpProxy.createProxyServer();
    proxyServer.on('error', (e) => {
      this.logger.error(e.message);
    });

    server.on('upgrade', (req, socket, head) => {
      const reqUrl = req.url?.replace(/\?.+$/, '') || '';
      const path = stripTrailingChar(reqUrl, '/');
      const proxyEntries = this.getProxyFromPlugins();
      const entry = proxyEntries.find((proxy) => proxy.context.some((item) => item === stripTrailingChar(path, '/')));
      if (!entry) {
        return;
      }
      proxyServer.ws(req, socket, head, {
        target: entry.target,
      });
    });

    const proxyEntries = this.getProxyFromPlugins();
    proxyEntries.forEach((entry) => {
      entry.context.forEach((route) => {
        this._proxyRoutes.add(route);
        app.use(`${route}/*`, (req, res) => {
          req.url = req.originalUrl;
          proxyServer.web(req, res, entry);
        });
      });
    });

    this._app = app;
    this._server = server;
  }
  /**
   * start a UI server.
   */
  async start({ bundleUiRoot, portRange }: StartOptions = {}) {
    const app = this.expressExtension.createApp();
    const publicDir = `/${this.publicDir}`;
    const defaultRoot = join(this.uiRoot.path, publicDir);
    const root = bundleUiRoot || defaultRoot;
    this.logger.debug(`UiServer, start from ${root}`);
    const server = await this.graphql.createServer({ app });
    await this.configureProxy(app, server);
    app.use(express.static(root, { index: false }));
    const port = await Port.getPortFromRange(portRange || [3100, 3200]);
    await this.setupServerSideRendering({ root, port, app });
    app.use(fallback('index.html', { root }));
    server.listen(port);
    this._port = port;

    // important: we use the string of the following message for the http.e2e.ts. if you change the message,
    // please make sure you change the `HTTP_SERVER_READY_MSG` const.
    const readyMessage = `UI server of ${this.uiRootExtension} is listening to port ${port}`;
    this.logger.info(readyMessage);
    this.setReady();
  }

  private async setupServerSideRendering({ root, port, app }: { root: string; port: number; app: Express }) {
    if (!this.buildOptions?.ssr) return;

    const ssrMiddleware = await createSsrMiddleware({
      root,
      port,
      title: this.uiRoot.name,
      logger: this.logger,
    });

    if (!ssrMiddleware) {
      this.logger.warn('[ssr] middleware failed setup');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    app.get('*', ssrMiddleware);
    this.logger.debug('[ssr] serving for "*"');
  }

  /**
   * start a UI dev server.
   */
  async dev({ portRange }: StartOptions = {}): Promise<RspackDevServer> {
    const devServerPort = await this.selectPort(portRange);
    await this.start({ portRange: [4100, 4200] });
    const expressAppPort = this._port;

    const config = await this.getDevConfig();
    const compiler = rspack(config as any);
    const devServerConfig = await this.getDevServerConfig(devServerPort, expressAppPort, config.devServer);
    const devServer = new RspackDevServer(devServerConfig, compiler);

    await devServer.start();
    this._port = devServerPort;
    return devServer;
  }

  private async selectPort(portRange?: number[] | number) {
    return Port.getPortFromRange(portRange || [3100, 3200]);
  }

  private getProxyFromPlugins() {
    const proxiesByPlugin = this.plugins.flatMap((plugin) => {
      return plugin.getProxy ? plugin.getProxy() : [];
    });
    return proxiesByPlugin;
  }

  private async getProxy(port = 4000) {
    const proxyEntries = this.getProxyFromPlugins();
    const catchAllProxies: ProxyEntry[] = [
      {
        context: ['/preview'],
        target: `http://${this.host}:${port}`,
        changeOrigin: true,
      },
    ];

    const gqlProxies: ProxyEntry[] = [
      {
        context: ['/graphql', '/api'],
        target: `http://${this.host}:${port}`,
        changeOrigin: true,
      },
      {
        context: ['/subscriptions'],
        target: `ws://${this.host}:${port}`,
        ws: true,
      },
    ];
    return gqlProxies.concat(proxyEntries).concat(catchAllProxies);
  }

  private async getDevServerConfig(
    appPort: number,
    gqlPort: number,
    config?: WdsConfiguration
  ): Promise<WdsConfiguration> {
    const proxy = await this.getProxy(gqlPort);
    const devServerConf = { ...config, proxy: proxy as any, port: appPort };

    return devServerConf;
  }

  static create(props: UIServerProps) {
    return new UIServer(
      props.graphql,
      props.express,
      props.ui,
      props.uiRoot,
      props.uiRootExtension,
      props.logger,
      props.publicDir,
      props.startPlugins
    );
  }
}
