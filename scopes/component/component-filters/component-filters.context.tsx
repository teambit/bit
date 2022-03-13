import React, { ComponentType, createContext, ReactNode, useContext, useState } from 'react';
import { SlotRegistry } from '@teambit/harmony';
import { ComponentModel } from '@teambit/component';

export type ComponentFiltersSlot = SlotRegistry<ComponentFilters>;

export interface ComponentFilterCriteria<State> {
  id: string;
  render: ComponentType<{ components: ComponentModel[] }>;
  match: (component: ComponentModel, state: State) => boolean;
  state: State;
  alwaysRunMatch?: boolean;
  order?: number;
}

export type DeprecateFilterCriteria = ComponentFilterCriteria<boolean>;

export type EnvsFilterCriteria = ComponentFilterCriteria<Map<string, boolean>>;

export type ComponentFilters = ComponentFilterCriteria<any>[];

export type ComponentFilterContextType = {
  filters: ComponentFilters;
  updateFilter: (filter: ComponentFilterCriteria<any>) => void;
  setFilters: (filters: ComponentFilters) => void;
  matches: (
    filters: ComponentFilters,
    components: ComponentModel[]
  ) => { component: ComponentModel; isHidden?: boolean }[];
};

export const ComponentFilterContext = createContext<ComponentFilterContextType>({
  filters: [],
  setFilters: () => {},
  updateFilter: () => {},
  matches: (filters, components) => {
    return components.map((component) => {
      let isHidden = false;
      filters.forEach((filter) => {
        isHidden = !filter.match(component, filter.state);
      });
      return {
        component,
        isHidden,
      };
    });
  },
});

export const ComponentFiltersProvider = ({ children }: { children: ReactNode }) => {
  const { filters: defaultValue, matches } = useContext(ComponentFilterContext);
  const [filters, setFilters] = useState<ComponentFilters>(defaultValue);
  return (
    <ComponentFilterContext.Provider
      value={{
        filters,
        setFilters,
        updateFilter: (updatedFilter) => {
          setFilters(filters.map((filter) => (filter.id === updatedFilter.id ? updatedFilter : filter)));
        },
        matches,
      }}
    >
      {children}
    </ComponentFilterContext.Provider>
  );
};
