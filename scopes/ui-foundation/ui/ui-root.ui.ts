import { RouteProps } from 'react-router-dom';

export type UIRootUI = {
  routes: RouteProps[];
};

export type UIRootFactory = () => UIRootUI;
