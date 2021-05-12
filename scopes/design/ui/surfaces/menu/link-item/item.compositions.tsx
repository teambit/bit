import React from 'react';
import { useLocation } from '@teambit/ui.routing.provider';

import { MenuLinkItem } from './link-item';

export function Preview() {
  return (
    <MenuLinkItem icon="settings" href="/settings">
      Menu link
    </MenuLinkItem>
  );
}

export function Active() {
  const location = useLocation();

  return (
    <MenuLinkItem icon="settings" href={location.pathname} exact>
      Active link
    </MenuLinkItem>
  );
}
