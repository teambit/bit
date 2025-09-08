import type { ReactNode } from 'react';
import { ComponentID } from '@teambit/component';
import type { ComponentFilterCriteria } from '@teambit/component.ui.component-filters.component-filter-context';

export interface ItemType {
  value: string;
  icon: ReactNode;
  description: string;
  checked?: boolean;
  element: ReactNode;
}

export type EnvFilterEnvState = {
  active: boolean;
  icon?: string;
  displayName: string;
  id: string;
  description: string;
  componentId: ComponentID;
};

export type EnvFilterState = {
  envsState: Map<string, EnvFilterEnvState>;
  dropdownState: boolean;
};

export type EnvsFilterCriteria = ComponentFilterCriteria<EnvFilterState>;
