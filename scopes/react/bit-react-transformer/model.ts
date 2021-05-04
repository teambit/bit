export const componentMetaField = '__bit_component';

export const fieldComponentId = 'id';
export const fieldHomepageUrl = 'homepage';

export type ComponentMeta = {
  [fieldComponentId]: string;
  [fieldHomepageUrl]?: string;
};

export interface ComponentMetaHolder {
  [componentMetaField]: ComponentMeta;
}
