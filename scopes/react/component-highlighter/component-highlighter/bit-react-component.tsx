export interface BitComponent {
  __bitComponentId: string;
}
export function isBitComponent(component: any): component is BitComponent {
  return component && typeof component.__bitComponentId === 'string';
}
