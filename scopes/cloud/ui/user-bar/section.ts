import type { SlotRegistry } from '@teambit/harmony';

export type UserBarSection = {
  /**
   * display name of the user bar.
   */
  displayName: string;

  /**
   * category name of the user bar.
   */
  categoryName: string;
};

export type UserBarSectionSlot = SlotRegistry<UserBarSection>;
