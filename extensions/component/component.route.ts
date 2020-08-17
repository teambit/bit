import { Route, Request, Response } from '@teambit/express';
import { ComponentExtension } from './component.extension';
import { ComponentID } from './id';
import { NextFunction } from '@teambit/express/types';

export class ComponentRoute implements Route {
  constructor(private registerRoute: Route, private componentExtension: ComponentExtension) {}
  dynamicRouteRegex = '/?[^./@]+/[^.@]*';
  readonly route = `/:componentId(${this.dynamicRouteRegex})/@${this.registerRoute.route}`;

  get componentMiddlewares() {
    return [
      async (req: Request, res: Response, next: NextFunction) => {
        const { componentId } = req.params;
        // TODO @guy: hack we should fix this. (consider moving this route to scope extension.)
        const host = this.componentExtension.getHost('@teambit/scope');
        const component = await host.get(ComponentID.fromString(componentId, false));
        // @ts-ignore
        req.component = component;
        next();
      },
    ];
  }

  method = this.registerRoute.method;
  middlewares = this.componentMiddlewares.concat(this.registerRoute.middlewares);
}
