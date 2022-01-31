import { ReactNode, ComponentType } from 'react';

export type DrawerType = {
  /**
   * unique id of the drawer.
   */
  id: string;
  /**
   * name of the drawer.
   */
  name: ReactNode; // TODO - make sure componentType makes sence here

  /**
   * drawer right widget
   */
  widget?: ReactNode;

  /**
   * drawer context
   */
  Context?: ComponentType<any>;

  /**
   * tooltip for the drawer.
   */
  tooltip?: string;

  /**
   * component to render within the drawer.
   */
  render: ComponentType;
};
