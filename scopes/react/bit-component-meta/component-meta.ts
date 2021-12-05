import type { ComponentType } from 'react';

export const componentMetaField = '__bit_component';

export const componentMetaProperties = {
  componentId: 'id',
  homepageUrl: 'homepage',
  isExported: 'exported',
} as const;

export type ComponentMeta = {
  [componentMetaProperties.componentId]: string;
  [componentMetaProperties.homepageUrl]?: string;
  [componentMetaProperties.isExported]?: boolean;
};

export interface ComponentMetaHolder {
  [componentMetaField]: ComponentMeta;
}

export type ReactComponentMetaHolder = ComponentType & ComponentMetaHolder;

export function hasComponentMeta(component: any): component is ComponentMetaHolder {
  return component && typeof component.__bit_component === 'object' && typeof component.__bit_component.id === 'string';
}
