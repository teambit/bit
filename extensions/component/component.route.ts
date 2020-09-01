import { NextFunction, Request, Response, Route } from '@teambit/express';

import { ComponentMain } from './component.main.runtime';
import { ComponentID } from './id';

export class ComponentRoute implements Route {
  constructor(private registerRoute: Route, private componentExtension: ComponentMain) {}
  dynamicRouteRegex = '/?[^./@]+/[^.@]*';
  readonly route = `/:componentId(${this.dynamicRouteRegex})/@${this.registerRoute.route}`;

  get componentMiddlewares() {
    return [
      async (req: Request, res: Response, next: NextFunction) => {
        const { componentId } = req.params;
        // TODO @guy: hack we should fix this. (consider moving this route to scope extension.)
        const host = this.componentExtension.getHost('teambit.bit/scope');
        const component = await host.get(ComponentID.fromLegacyString(componentId));
        // @ts-ignore
        req.component = component;
        next();
      },
    ];
  }

  method = this.registerRoute.method;
  middlewares = this.componentMiddlewares.concat(this.registerRoute.middlewares);
}
