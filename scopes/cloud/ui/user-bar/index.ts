import { SlotRegistry } from '@teambit/harmony';
import { UserBarItem } from './item';
import { UserBarSection } from './section';

export { UserBar } from './user-bar';
export type { UserBarProps } from './user-bar';

export type { UserBarItem };
export type { UserBarSection };

export type UserBarItemSlot = SlotRegistry<UserBarItem[]>;
export type UserBarSectionSlot = SlotRegistry<UserBarSection[]>;
