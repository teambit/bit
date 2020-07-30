import { flatten, lowerCase, concat } from 'lodash';
import express from 'express';
import cors from 'cors';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { Route, Request, Response } from './types';
import { errorHandle, notFound } from './middlewares';
import { LoggerExt, Logger, LogPublisher } from '../logger';

export type ExpressConfig = {
  port: number;
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
    readonly logger: LogPublisher
  ) {}

  /**
   * start a express server.
   */
  async listen(port?: number) {
    const internalRoutes = this.createRootRoutes();
    const routes = this.createRoutes();
    const allRoutes = concat(routes, internalRoutes);
    const serverPort = port || this.config.port;
    const app = express();
    app.use(cors());

    allRoutes.forEach((routeInfo) => {
      const { method, path, middlewares } = routeInfo;
      // TODO: @guy make sure to support single middleware here.
      app[method](path, middlewares);
    });

    app.use(notFound);
    app.use(errorHandle);
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
        namespace: ExpressExtension.id,
        method: 'get',
        path: '/_health',
        middlewares: [async (req: Request, res: Response) => res.send('ok')],
      },
    ];
  }
  private createRoutes() {
    const routesSlots = this.moduleSlot.toArray();
    const routeEntries = routesSlots.map(([extensionId, routes]) => {
      return routes.map((route) => ({
        namespace: extensionId,
        method: lowerCase(route.method),
        path: route.route,
        middlewares: route.middlewares,
      }));
    });

    return flatten(routeEntries);
  }

  static id = '@teambit/express';
  static slots = [Slot.withType<Route[]>()];
  static dependencies = [LoggerExt];

  static defaultConfig = {
    port: 4001,
  };

  static async provider([loggerFactory]: [Logger], config: ExpressConfig, [routeSlot]: [RouteSlot]) {
    const logger = loggerFactory.createLogPublisher(ExpressExtension.id);
    return new ExpressExtension(config, routeSlot, logger);
  }
}
