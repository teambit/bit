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
): [ComponentFilterCriteria<T>, Dispatch<SetStateAction<ComponentFilterCriteria<T>>>] | undefined {
  const filterContext = useContext(ComponentFilterContext);
  const filterFromContext = filterContext?.filters.find((existingFilter) => existingFilter.id === filterId);

  useEffect(() => {
    if (filterFromContext && defaultState) {
      const initialFilterState = { ...filterFromContext, state: defaultState };
      updateFilter(filterContext as ComponentFilterContextType, initialFilterState);
    }
  }, [filterId]);

  if (!filterContext || !filterFromContext) return undefined;
  type Setter = Dispatch<SetStateAction<ComponentFilterCriteria<any>>>;

  const setState: Setter = (updatedState) => {
    const nextState = isFunction(updatedState) ? updatedState(filterFromContext) : updatedState;
    updateFilter(filterContext, nextState);
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

export const runAllFilters: (
  filters: ComponentFilters,
  data: { components: ComponentModel[]; lanes?: LanesModel }
) => ComponentModel[] = (filters, { components, lanes }) => {
  return components.filter((component) => filters.every((filter) => filter.match({ component, lanes }, filter.state)));
};
