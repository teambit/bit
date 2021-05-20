import type { ComponentMetaHolder } from '@teambit/react.babel.bit-react-transformer';

export function hasComponentMeta(component: any): component is ComponentMetaHolder {
  return component && typeof component.__bit_component === 'object' && typeof component.__bit_component.id === 'string';
}
