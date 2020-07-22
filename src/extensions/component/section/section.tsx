import { RouteProps } from 'react-router-dom';
import { NavLinkProps } from '../../react-router/nav-link';

export interface Section {
  route: RouteProps;
  navigationLink: NavLinkProps;
}
