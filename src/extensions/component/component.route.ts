import { Route, Request, Response, RouteSlot, ExpressExtension } from '../express';
import { ComponentExtension } from './component.extension';
import { ComponentID } from './id';
import { NextFunction } from '../express/types';

export class ComponentRoute implements Route {
  constructor(
    private setRoute: string | RegExp,
    private setMiddlewares: ((req: Request, res: Response, next?: NextFunction) => Promise<any>)[],
    private componentExtension: ComponentExtension
  ) {}
  // TODO: check how to fix wildcard for component ID. // /ui/button/preview
  // readonly route = new RegExp('([\\w\\/-]*)/\\@/(.*)');
  readonly route = new RegExp(`([\\w\\/-]*)/\\@${this.setRoute}`);
  // TODO: guy add support all method
  readonly method = 'get';

  get componentMiddlewares() {
    return [
      //TODO : fix next type
      async (req: Request, res: Response, next: any) => {
        const [componentPath, path] = Object.values(req.params);
        req.params.path = path;
        const componentId = componentPath.substring(1);
        // TODO @guy: hack we should fix this. (consider moving this route to scope extension.)
        const host = this.componentExtension.getHost('@teambit/scope');

        const component = await host.get(ComponentID.fromString(componentId, false));
        // @ts-ignore
        req.component = component;
        next();
      },
    ];
  }

  middlewares = this.componentMiddlewares.concat(this.setMiddlewares);
}
