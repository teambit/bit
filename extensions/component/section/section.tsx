import { NavLinkProps } from '@teambit/react-router';
import { RouteProps } from 'react-router-dom';

export interface Section {
  route: RouteProps;
  navigationLink: NavLinkProps;
  order?: number;
}
