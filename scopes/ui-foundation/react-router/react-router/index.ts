import { ReactRouterAspect } from './react-router.aspect';

export { Routing } from './routing-method';
export type { ReactRouterUI } from './react-router.ui.runtime';

// TODO - replace with resolveFromHost / resolveFromApp when available
// this exposes the Link components installed in bit bin, so they can use the same RoutingProvider file from node_modules
export { Link, LinkProps, useLocation, UseNavigate, NavigationProvider } from '@teambit/base-react.navigation.link';

export * as ReactRouter from 'react-router-dom';
export { LinkAnchor, LinkContextProvider, useLinkContext } from '@teambit/ui-foundation.ui.react-router.link-anchor';
export * as ReactRouter from 'react-router';

export { ReactRouterAspect };
export default ReactRouterAspect;
