import { Route, Request, Response, RouteSlot } from '../express';
import { response } from 'express';

const dynamicRouteRegex = '/?[^./@]+/[^./@]+/[^.@]*';

export class ComponentRoute implements Route {
  constructor(private routeSlot: RouteSlot) {}
  // TODO: check how to fix wildcard for component ID.
  route = `/:id(${dynamicRouteRegex})/:extension`;
  method = 'get';
  middlewares = [
    async (req: Request, res: Response) => {
      this.express.applyRouteSlot(this.routeSlot, req, res);
      // const route = this.routeSlot.get(req.params.extension);
      // if (!route) return res.send('error');// res.error(); extension not found
      // const actualRoute = route[0];
      // actualRoute.middlewares[0](request, response);
    },
  ];
}
