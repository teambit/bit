import React, { createContext, ReactNode, ComponentType, useState, useContext } from 'react';
import { SlotRegistry } from '@teambit/harmony';
import { ComponentModel } from '@teambit/component';
import { ComponentFilterContext } from '../component-filters/component-filters.context';

export type DrawerWidgetSlot = SlotRegistry<ReactNode[]>;
export type DrawerComponentModel = { model: ComponentModel; isHidden?: boolean };

export type ComponentTreeContextType = {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
};

export const ComponentTreeContext = createContext<ComponentTreeContextType>({
  collapsed: true,
  setCollapsed: () => {},
});

export const ComponentTreeProvider = ({ children }: { children: ReactNode }) => {
  const { collapsed: defaultValue } = useContext(ComponentTreeContext);
  const [collapsed, setCollapsed] = useState<boolean>(defaultValue);
  return <ComponentTreeContext.Provider value={{ collapsed, setCollapsed }}>{children}</ComponentTreeContext.Provider>;
};

export type ComponentFilterWidgetContextType = {
  filterWidgetOpen: boolean;
  setFilterWidget: (open: boolean) => void;
};

export const ComponentFilterWidgetContext = createContext<ComponentFilterWidgetContextType>({
  filterWidgetOpen: false,
  setFilterWidget: () => {},
});

export const ComponentFilterWidgetProvider = ({ children }: { children: ReactNode }) => {
  const { filterWidgetOpen: defaultValue } = useContext(ComponentFilterWidgetContext);
  const [filterWidgetOpen, setFilterWidget] = useState<boolean>(defaultValue);
  return (
    <ComponentFilterWidgetContext.Provider value={{ filterWidgetOpen, setFilterWidget }}>
      {children}
    </ComponentFilterWidgetContext.Provider>
  );
};

export type DrawerComponentsContextType = {
  components: DrawerComponentModel[];
  loading?: boolean;
  setLoading: (loading: boolean) => void;
  setComponents: (components: DrawerComponentModel[]) => void;
};

export const DrawerComponentsContext = createContext<DrawerComponentsContextType>({
  components: [],
  setComponents: () => {},
  setLoading: () => {},
});

export const DrawerComponentsProvider = ({
  children,
  components = [],
  loading = false,
}: {
  children: ReactNode;
  components: ComponentModel[];
  loading?: boolean;
}) => {
  const { matches, filters } = useContext(ComponentFilterContext);
  const [loadingState, setLoadingState] = useState<boolean>(loading);
  const [filteredComponents, setComponents] = useState<DrawerComponentModel[]>(matches(filters, components));
  return (
    <DrawerComponentsContext.Provider
      value={{ components: filteredComponents, setComponents, loading: loadingState, setLoading: setLoadingState }}
    >
      {children}
    </DrawerComponentsContext.Provider>
  );
};

// export function ComponentFilters({ filters, components }: ComponentFiltersProps) {
//   const [activeFilters, setActiveFilter] = useState<ComponentFilter[]>([]);
//   let filteredComponents = components;
//   activeFilters?.forEach((activeFilter) => {
//     filteredComponents = filteredComponents.filter((component) => activeFilter.match(component, activeFilter.state));
//   });
// }

// export const envs: ComponentFilter<Map<string, boolean>> = {
//   id: 'envs',
//   render: ({components}) => {
//     const {activeFilters, setActiveFilter} = useContext(ComponentFilterContext);
//     let uniqueEnvsWithIcons = new Map<string, string>();
//     components.forEach(component => {
//       if(component.environment) {
//         uniqueEnvsWithIcons.set(component.environment?.id, component.environment?.icon);
//       }
//     });
//     const multiSelectEnvsItemList = Array.from(uniqueEnvsWithIcons.keys()).map(env => ({value: env, icon: uniqueEnvsWithIcons.get(env), checked: activeFilters.find(activeFilter => activeFilter.id === env)}))
//   },
//   match: (component, state) =>
// }
