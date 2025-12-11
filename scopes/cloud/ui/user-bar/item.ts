import type { CloudUser } from '@teambit/cloud.models.cloud-user';
import type { ComponentType } from 'react';

export type UserBarItem = {
  /**
   * category to add the user item.
   */
  category?: string;

  /**
   * weight to sort the item.
   */
  weight?: number;

  /**
   * label for the item.
   */
  label?: string;

  /**
   * icon for the item.
   */
  icon?: string;

  /**
   * navigate to href after link.
   */
  href?: string;

  /**
   * component to use.
   */
  component?: ComponentType<{ user?: CloudUser }>;
};
