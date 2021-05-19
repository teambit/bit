import { useLocation } from 'react-router-dom';
// eslint-disable-next-line no-restricted-imports
import { Link } from '@teambit/ui-foundation.ui.react-router.link';
// eslint-disable-next-line no-restricted-imports
import { NavLink } from '@teambit/ui-foundation.ui.react-router.nav-link';

// React Router Link and NavLink are internal implementations of our isomorphic routing components.
// do not use them, use @teambit/base-ui.routing.link and @teambit/base-ui.routing.nav-link instead
//
// here we define them as the routing components of the application.

/**
 * defines react-router's routing components (link, useLocation, etc)
 */
export const reactRouterRouting = { Link, NavLink, useLocation };
