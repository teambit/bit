import React from 'react';
import { RouteProps } from 'react-router-dom';
import type { UseComponentType, Filters } from './ui/use-component';

export type GetComponentsOptions = {
  useComponent?: UseComponentType;
  componentId?: string | (() => string | undefined);
  useComponentFilters?: () => Filters;
  path?: string;
  skipRightSide?: boolean;
  RightNode?: React.ReactNode;
  className?: string;
  routes?: RouteProps[];
  authToken?: string;
};
