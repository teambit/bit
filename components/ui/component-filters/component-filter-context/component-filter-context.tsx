import React, {
  ComponentType,
  createContext,
  ReactNode,
  useContext,
  useState,
  Dispatch,
  SetStateAction,
  useEffect,
} from 'react';
import { ComponentModel } from '@teambit/component';
import { isFunction } from 'lodash';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';

export type ComponentFilters = Array<ComponentFilterCriteria<any>>;
export type ComponentFilterRenderProps = {
  components: ComponentModel[];
  lanes?: LanesModel;
} & React.HTMLAttributes<HTMLDivElement>;

export type ComponentFilterCriteria<State> = {
  id: string;
  render: ComponentType<ComponentFilterRenderProps>;
  match: (data: { component: ComponentModel; lanes?: LanesModel }, state: State) => boolean;
  state: State;
  order?: number;
};

export type ComponentFilterContextType = {
  filters: ComponentFilters;
  setFilters: React.Dispatch<React.SetStateAction<ComponentFilters>>;
};

export const ComponentFilterContext = createContext<ComponentFilterContextType | undefined>(undefined);
const updateFilter = (filterContext: ComponentFilterContextType, updatedFilter: ComponentFilterCriteria<any>) => {
  filterContext.setFilters((currentFilters) => {
    return currentFilters.map((currentFilter) => {
      if (currentFilter.id === updatedFilter?.id) return updatedFilter;
      return currentFilter;
    });
  });
};

export function useComponentFilter<T>(
  filterId: string,
  defaultState?: T
): [ComponentFilterCriteria<T> | undefined, Dispatch<SetStateAction<ComponentFilterCriteria<T>>>] {
  const filterContext = useContext(ComponentFilterContext);

  const filterFromContext: ComponentFilterCriteria<any> = filterContext?.filters.find(
    (existingFilter) => existingFilter.id === filterId
  ) || {
    id: filterId,
    render: () => null,
    match: () => true,
    state: defaultState,
    order: 0,
  };

  useEffect(() => {
    if (filterContext && defaultState !== undefined) {
      const initialFilterState = { ...filterFromContext, state: defaultState };
      updateFilter(filterContext, initialFilterState);
    }
  }, [filterId]);

  type Setter = Dispatch<SetStateAction<ComponentFilterCriteria<any>>>;

  const setState: Setter = (updatedState) => {
    const nextState = isFunction(updatedState) ? updatedState(filterFromContext) : updatedState;
    if (filterContext) {
      updateFilter(filterContext, nextState);
    }
  };

  return [filterFromContext, setState];
}

export function useComponentFilters():
  | [ComponentFilters, React.Dispatch<React.SetStateAction<ComponentFilters>>]
  | undefined {
  const filterContext = useContext(ComponentFilterContext);
  return filterContext ? [filterContext.filters, filterContext.setFilters] : undefined;
}

export const ComponentFiltersProvider = ({
  children,
  filters = [],
}: {
  children: ReactNode;
  filters?: ComponentFilters;
}) => {
  const [filtersState, setFilters] = useState<ComponentFilters>(filters || []);
  const contextValue = React.useMemo(
    () => ({
      filters: filtersState,
      setFilters,
    }),
    [filtersState, setFilters]
  );

  return <ComponentFilterContext.Provider value={contextValue}>{children}</ComponentFilterContext.Provider>;
};

export const runAllFilters: (
  filters: ComponentFilters,
  data: { components: ComponentModel[]; lanes?: LanesModel }
) => ComponentModel[] = (filters, { components, lanes }) => {
  return components.filter((component) => filters.every((filter) => filter.match({ component, lanes }, filter.state)));
};
