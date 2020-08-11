import { flatten, lowerCase, concat } from 'lodash';
import express, { Express } from 'express';
import cors from 'cors';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { Route, Middleware, Request, Response } from './types';
import { catchErrors } from './middlewares';
import { LoggerExtension, Logger } from '../logger';

export type ExpressConfig = {
  port: number;
  namespace: string;
};

export type RouteSlot = SlotRegistry<Route[]>;

export class ExpressExtension {
  constructor(
    /**
     * extension config
     */
    readonly config: ExpressConfig,

    /**
     * slot for registering graphql modules
     */
    private moduleSlot: RouteSlot,

    /**
     * logger extension.
     */
    readonly logger: Logger
  ) {}

  /**
   * start a express server.
   */
  async listen(port?: number) {
    const serverPort = port || this.config.port;
    const app = this.createApp();
    app.listen(serverPort);
  }

  /**
   * register a new express routes.
   */
  register(routes: Route[]) {
    this.moduleSlot.register(routes);
    return this;
  }

  private createRootRoutes() {
    // TODO: @guy refactor health to service aspect.
    return [
      {
        namespace: ExpressExtension.id,
        method: 'get',
        path: '/_health',
        middlewares: [async (req: Request, res: Response) => res.send('ok')],
      },
    ];
  }

  createApp(expressApp?: Express): Express {
    const internalRoutes = this.createRootRoutes();
    const routes = this.createRoutes();
    const allRoutes = concat(routes, internalRoutes);
    const app = expressApp || express();
    app.use(cors());

    allRoutes.forEach((routeInfo) => {
      const { method, path, middlewares } = routeInfo;
      // TODO: @guy make sure to support single middleware here.
      app[method](`/${this.config.namespace}${path}`, this.catchErrorsMiddlewares(middlewares));
    });

    return app;
  }

  private createRoutes() {
    const routesSlots = this.moduleSlot.toArray();
    const routeEntries = routesSlots.map(([, routes]) => {
      return routes.map((route) => ({
        method: lowerCase(route.method),
        path: route.route,
        middlewares: route.middlewares,
      }));
    });

    return flatten(routeEntries);
  }

  private catchErrorsMiddlewares(middlewares: Middleware[]) {
    return middlewares.map((middleware) => catchErrors(middleware));
  }

  static id = '@teambit/express';
  static slots = [Slot.withType<Route[]>()];
  static dependencies = [LoggerExtension];

  static defaultConfig = {
    port: 4001,
    namespace: 'api',
  };

  static async provider([loggerFactory]: [LoggerExtension], config: ExpressConfig, [routeSlot]: [RouteSlot]) {
    const logger = loggerFactory.createLogger(ExpressExtension.id);
    return new ExpressExtension(config, routeSlot, logger);
  }
}
