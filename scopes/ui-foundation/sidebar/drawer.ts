import { ComponentType } from 'react';

export type Drawer = {
  /**
   * name of the drawer.
   */
  name: string;

  /**
   * tooltip for the drawer.
   */
  tooltip?: string;

  /**
   * component to render within the drawer.
   */
  render: ComponentType;
};
