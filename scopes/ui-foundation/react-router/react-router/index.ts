import { ReactRouterAspect } from './react-router.aspect';

export { Routing } from './routing-method';
export type { ReactRouterUI } from './react-router.ui.runtime';

export * as navigation from '@teambit/base-react.navigation.link';
export * as ReactRouter from 'react-router-dom';

export { ReactRouterAspect };
export default ReactRouterAspect;

// TODO - remove after releasing dependants (symphony)
export { /** @deprecated */ Link, /** @deprecated */ LinkProps } from '@teambit/base-ui.routing.link';
export { /** @deprecated */ NavLink, /** @deprecated */ NavLinkProps } from '@teambit/base-ui.routing.nav-link';
export {
  /** @deprecated */ RoutingProvider,
  /** @deprecated */ useRouting,
  /** @deprecated */ useLocation,
} from '@teambit/base-ui.routing.routing-provider';
export {
  /** @deprecated */ LinkAnchor,
  /** @deprecated */ LinkContextProvider,
  /** @deprecated */ useLinkContext,
} from '@teambit/ui-foundation.ui.react-router.link-anchor';
