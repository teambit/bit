import { NavLinkProps } from '@teambit/base-ui.routing.nav-link';
import { RouteProps } from 'react-router-dom';

export interface Section {
  route: RouteProps;
  navigationLink: NavLinkProps;
  /**
   * text to be used in the mobile res dropdown
   */
  displayName?: string;
  order?: number;
}
