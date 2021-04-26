export interface ComponentMeta {
  id: string;
  homepage: string;
}
export interface BitComponent {
  __bit_component: ComponentMeta;
}

export function isBitComponent(component: any): component is BitComponent {
  return component && typeof component.__bit_component === 'object' && typeof component.__bit_component.id === 'string';
}
