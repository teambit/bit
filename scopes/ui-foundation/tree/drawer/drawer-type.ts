import { ReactNode, ComponentType } from 'react';

export type DrawerType = {
  /**
   * name of the drawer.
   */
  name: ReactNode; // TODO - make sure componentType makes sence here

  /**
   * tooltip for the drawer.
   */
  tooltip?: string;

  /**
   * component to render within the drawer.
   */
  render: ComponentType;
};
