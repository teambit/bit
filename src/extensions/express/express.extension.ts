import _ from 'lodash';
import express from 'express';
import cors from 'cors';
import { Slot, SlotRegistry, Harmony } from '@teambit/harmony';
import { Route, Request, Response, NextFunction } from './types';
import { LoggerExt, Logger, LogPublisher } from '../logger';

export type ExpressConfig = {
  port: number;
};

export type RouteRegistry = SlotRegistry<Route[]>;

export class ExpressExtension {
  constructor(
    /**
     * extension config
     */
    readonly config: ExpressConfig,

    /**
     * slot for registering graphql modules
     */
    private moduleSlot: RouteRegistry,

    /**
     * logger extension.
     */
    readonly logger: LogPublisher
  ) {}

  /**
   * start a express server.
   */
  async listen(port?: number) {
    const internalRoutes = this.createRootRoutes();
    const routes = this.createRoutes();
    const allRoutes = _.concat(routes, internalRoutes);
    const serverPort = port || this.config.port;
    const app = express();
    app.use(cors());

    allRoutes.map((routeInfo) => {
      const { method, namespace, path, middlewares } = routeInfo;
      app[method](`/${namespace}${path}`, middlewares);
    });
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
    return [
      {
        namespace: '@teambit/express',
        method: 'get',
        path: '/healthz',
        middlewares: [async (req: Request, res: Response, next?: NextFunction) => res.send('ok')],
      },
    ];
  }
  private createRoutes() {
    const routesSlots = this.moduleSlot.toArray();
    const routes = routesSlots.map(([extensionId, routes]) => {
      return routes.map((route) => ({
        namespace: extensionId,
        method: _.lowerCase(route.method),
        path: route.route,
        middlewares: route.middlewares,
      }));
    });

    return _.flatten(routes);
  }

  static id = '@teambit/express';
  static slots = [Slot.withType<Route[]>()];
  static dependencies = [LoggerExt];

  static defaultConfig = {
    port: 4001,
  };

  static async provider([loggerFactory]: [Logger], config: ExpressConfig, [moduleSlot]: [RouteRegistry]) {
    const logger = loggerFactory.createLogPublisher(ExpressExtension.id);
    return new ExpressExtension(config, moduleSlot, logger);
  }
}
