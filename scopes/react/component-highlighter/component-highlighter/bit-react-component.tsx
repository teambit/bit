export interface BitComponent {
  componentId: string;
}
export function isBitComponent(component: any): component is BitComponent {
  return component && typeof component.componentId === 'string';
}
