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
