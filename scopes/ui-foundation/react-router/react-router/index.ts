import { ReactRouterAspect } from './react-router.aspect';

export { Routing } from './routing-method';
export type { ReactRouterUI } from './react-router.ui.runtime';

// TODO - replace with resolveFromHost / resolveFromApp when available
// this exposes the Link components installed in bit bin, so they can use the same RoutingProvider file from node_modules
export { Link, LinkProps } from '@teambit/ui.routing.link';
export { NavLink, NavLinkProps } from '@teambit/ui.routing.nav-link';

export { ReactRouterAspect };
export default ReactRouterAspect;
