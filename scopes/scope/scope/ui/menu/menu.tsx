import { Menu, MenuProps } from '@teambit/ui-foundation.ui.menu';
import { ScopeContext } from '@teambit/scope'; // we need to separate the provider and context from aspect. is this ok for now?
import classNames from 'classnames';
import React, { useContext } from 'react';
import { UseBoxDropdown } from '@teambit/ui-foundation.ui.use-box.dropdown';
import { Menu as ScopeUseBoxMenu } from '@teambit/ui-foundation.ui.use-box.scope-menu';
import styles from './menu.module.scss';

/**
 * scope menu.
 */
export function ScopeMenu({ className, ...rest }: MenuProps) {
  return <Menu {...rest} className={classNames(styles.scopMenu, className)} />;
}

export function ScopeUseBox() {
  const scope = useContext(ScopeContext);
  return (
    <UseBoxDropdown
      position="bottom-end"
      className={styles.useBox}
      Menu={() => <ScopeUseBoxMenu scopeName={scope.name} />}
    />
  );
}
