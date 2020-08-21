import { Route, Request, Response } from '../express';
import { ComponentID } from './id';
import { NextFunction } from '../express';
import { ComponentMain } from './component.main.runtime';

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
