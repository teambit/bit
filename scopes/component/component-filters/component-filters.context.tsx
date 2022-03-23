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
import { SlotRegistry } from '@teambit/harmony';
import { ComponentModel } from '@teambit/component';

export type ComponentFiltersSlot = SlotRegistry<ComponentFilters>;

export type ComponentFilterCriteria<State> = {
  id: string;
  render: ComponentType<{ components: ComponentModel[] } & React.HTMLAttributes<HTMLDivElement>>;
  match: (component: ComponentModel, state: State) => boolean;
  state: State;
  order?: number;
};

export type ComponentFilters = ComponentFilterCriteria<any>[];

export type ComponentFilterContextType = {
  filters: ComponentFilters;
  updateFilter: (filter: ComponentFilterCriteria<any>) => void;
  setFilters: (filters: ComponentFilters) => void;
};

export const ComponentFilterContext = createContext<ComponentFilterContextType | undefined>(undefined);
export function useComponentFilter<T>(
  filter: ComponentFilterCriteria<T>,
  defaultState?: T
): [ComponentFilterCriteria<T>, Dispatch<SetStateAction<ComponentFilterCriteria<T>>>] | undefined {
  const filterContext = useContext(ComponentFilterContext);
  const filterFromContext = filterContext?.filters.find((existingFilter) => existingFilter.id === filter.id);

  useEffect(() => {
    if (filterFromContext && defaultState) {
      const initialFilterState = { ...filterFromContext, state: defaultState };
      filterContext?.updateFilter(initialFilterState);
    }
  }, []);

  if (!filterContext) return undefined;
  if (!filterFromContext) return undefined;

  const setState = (updatedState) => {
    filterContext.updateFilter(updatedState);
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
        updateFilter: (updatedFilter) => {
          setFilters(filtersState.map((filter) => (filter.id === updatedFilter.id ? updatedFilter : filter)));
        },
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
  return components.filter((component) => filters.every((filter) => filter.match(component, filter)));
};
