import { Route, Request, Response, RouteSlot, ExpressExtension } from '../express';
import { ComponentExtension } from './component.extension';
import { ComponentID } from './id';

export class ComponentRoute implements Route {
  constructor(
    private routeSlot: RouteSlot,
    private express: ExpressExtension,
    private componentExtension: ComponentExtension
  ) {}
  // TODO: check how to fix wildcard for component ID. // /ui/button/preview
  route = `/:id([\\w\\/-]*[\\w-])/@/:path*`;
  method = 'get';
  middlewares = [
    async (req: Request, res: Response) => {
      // TODO @guy: hack we should fix this. (consider moving this route to scope extension.)
      const host = this.componentExtension.getHost('@teambit/scope');
      const component = await host.get(ComponentID.fromString(req.params.id, false));
      // @ts-ignore
      req.component = component;

      this.express.applyRouteSlot(this.routeSlot, req, res);
    },
  ];
}
