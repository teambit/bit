export const componentMetaField = '__bit_component';

export const fieldComponentId = 'id';
export const fieldHomepageUrl = 'homepage';
export const fieldIsExported = 'exported';

export type ComponentMeta = {
  [fieldComponentId]: string;
  [fieldHomepageUrl]?: string;
  [fieldIsExported]?: boolean;
};

export interface ComponentMetaHolder {
  [componentMetaField]: ComponentMeta;
}
