import { Menu, MenuProps } from '@teambit/ui-foundation.ui.menu';
import React from 'react';
import styles from './menu.module.scss';

/**
 * scope menu.
 */
export function ScopeMenu({ ...props }: MenuProps) {
  return <Menu {...props} className={styles.scopMenu} />;
}
