import { RouteProps } from 'react-router-dom';
import { NavLinkProps } from '@teambit/react-router';

export interface Section {
  route: RouteProps;
  navigationLink: NavLinkProps;
}
