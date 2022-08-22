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

export type ComponentFilters = Array<ComponentFilterCriteria<any>>;

export type ComponentFilterCriteria<State> = {
  id: string;
  render: ComponentType<{ components: ComponentModel[] } & React.HTMLAttributes<HTMLDivElement>>;
  match: (component: ComponentModel, state: State) => boolean;
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
  filter: ComponentFilterCriteria<T>,
  defaultState?: T
): [ComponentFilterCriteria<T>, Dispatch<SetStateAction<ComponentFilterCriteria<T>>>] | undefined {
  const filterContext = useContext(ComponentFilterContext);
  const filterFromContext = filterContext?.filters.find((existingFilter) => existingFilter.id === filter.id);

  useEffect(() => {
    if (filterFromContext && defaultState) {
      const initialFilterState = { ...filterFromContext, state: defaultState };
      updateFilter(filterContext as ComponentFilterContextType, initialFilterState);
    }
  }, []);

  if (!filterContext || !filterFromContext) return undefined;
  type Setter = Dispatch<SetStateAction<ComponentFilterCriteria<any>>>;

  const setState: Setter = (updatedState) => {
    const nextState = isFunction(updatedState) ? updatedState(filterFromContext) : updatedState;
    updateFilter(filterContext, nextState);
  };

  return [filterFromContext, setState];
}

export const ComponentFiltersProvider = ({
  children,
  filters,
}: {
  children: ReactNode;
  filters?: ComponentFilters;
}) => {
  const [filtersState, setFilters] = useState<ComponentFilters>(filters || []);

  return (
    <ComponentFilterContext.Provider
      value={{
        filters: filtersState,
        setFilters,
      }}
    >
      {children}
    </ComponentFilterContext.Provider>
  );
};

export const runAllFilters: (filters: ComponentFilters, components: ComponentModel[]) => ComponentModel[] = (
  filters,
  components
) => {
  return components.filter((component) => filters.every((filter) => filter.match(component, filter.state)));
};
