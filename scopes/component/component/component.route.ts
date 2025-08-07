import type { NextFunction, Request, Response, Route } from '@teambit/express';

import type { ComponentMain } from './component.main.runtime';

export type RegisteredComponentRoute = Route & {
  resolveComponent?: boolean;
};

export type ComponentUrlParams = {
  componentId: string;
};

export class ComponentRoute implements Route {
  constructor(
    private registerRoute: RegisteredComponentRoute,
    private componentExtension: ComponentMain
  ) {}
  dynamicRouteRegex = '/?[^/@]+/[^~]*';
  readonly route = `/:componentId(${this.dynamicRouteRegex})/~aspect${this.registerRoute.route}`;

  get componentMiddlewares() {
    return [
      async (req: Request<ComponentUrlParams>, res: Response, next: NextFunction) => {
        const resolveComponent = this.registerRoute.resolveComponent ?? true;
        if (resolveComponent) {
          const { componentId } = req.params;
          const host = this.componentExtension.getHost();
          const compId = await host.resolveComponentId(componentId);
          const component = await host.get(compId);
          // @ts-expect-error
          req.component = component;
        }
        next();
      },
    ];
  }

  method = this.registerRoute.method;
  // @ts-expect-error
  middlewares = this.componentMiddlewares.concat(this.registerRoute.middlewares);
}
