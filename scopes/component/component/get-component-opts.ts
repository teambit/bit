import type { UseComponentType } from './ui/use-component';
import { Filters } from './ui/use-component-query';

export type GetComponentsOptions = {
  useComponent?: UseComponentType;
  componentId?: string | (() => string | undefined);
  useComponentFilters?: () => Filters;
  path?: string;
};
