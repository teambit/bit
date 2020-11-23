import React, { CSSProperties } from 'react';
import { NativeNavLink } from './native-nav-link';

const activeStyles: CSSProperties = { fontWeight: 'bold', color: 'red' };

export const activeNavLink = () => {
  return (
    <NativeNavLink href="/preview" activeStyle={activeStyles}>
      active NavLink
    </NativeNavLink>
  );
};

export const inactiveNavLink = () => {
  return (
    <NativeNavLink href="https://tib.ved" activeStyle={activeStyles}>
      inactive NavLink
    </NativeNavLink>
  );
};
