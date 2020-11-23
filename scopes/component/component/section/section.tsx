import { NavLinkProps } from '@teambit/ui.react-router.nav-link';
import { RouteProps } from 'react-router-dom';

export interface Section {
  route: RouteProps;
  navigationLink: NavLinkProps;
  order?: number;
}
