import { ComponentType } from 'react';

export type ScopeBadgeProps = {
  label: string;
  icon: string;
};

export interface ScopeBadge {
  /**
   * can be used to override the entire badge with a new component.
   */
  badge?: ComponentType<ScopeBadgeProps>;

  /**
   * title of the badge.
   */
  label: string;

  /**
   * icon of the badge.
   */
  icon: string;
}
