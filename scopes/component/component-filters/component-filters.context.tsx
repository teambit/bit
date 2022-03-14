import React, { ComponentType, createContext, ReactNode, useContext, useState } from 'react';
import { SlotRegistry } from '@teambit/harmony';
import { ComponentModel } from '@teambit/component';

export type ComponentFiltersSlot = SlotRegistry<ComponentFilters>;

export type ComponentFilterCriteria<State> = {
  id: string;
  render: ComponentType<{ components: ComponentModel[] }>;
  match: (component: ComponentModel, state: State) => boolean;
  state: State;
  order?: number;
};

export type ComponentFilters = ComponentFilterCriteria<any>[];

export type ComponentFilterContextType = {
  filters: ComponentFilters;
  updateFilter: (filter: ComponentFilterCriteria<any>) => void;
  setFilters: (filters: ComponentFilters) => void;
  matches: (filters: ComponentFilters, components: ComponentModel[]) => { model: ComponentModel; isHidden?: boolean }[];
};

export const ComponentFilterContext = createContext<ComponentFilterContextType>({
  filters: [],
  setFilters: () => {},
  updateFilter: () => {},
  matches: (filters, components) => {
    return components.map((component) => {
      let isVisible = true;
      filters.forEach((filter) => {
        isVisible = filter.match(component, filter.state) && isVisible;
      });
      return {
        model: component,
        isHidden: !isVisible,
      };
    });
  },
});

export const ComponentFiltersProvider = ({
  children,
  filters,
}: {
  children: ReactNode;
  filters?: ComponentFilters;
}) => {
  const { filters: defaultValue, matches } = useContext(ComponentFilterContext);
  const [filtersState, setFilters] = useState<ComponentFilters>(filters || defaultValue);
  return (
    <ComponentFilterContext.Provider
      value={{
        filters: filtersState,
        setFilters,
        updateFilter: (updatedFilter) => {
          setFilters(filtersState.map((filter) => (filter.id === updatedFilter.id ? updatedFilter : filter)));
        },
        matches,
      }}
    >
      {children}
    </ComponentFilterContext.Provider>
  );
};
