import { RouteProps } from 'react-router-dom';
import { NavLinkProps } from '../../react-router';

export interface Section {
  route: RouteProps;
  navigationLink: NavLinkProps;
}
