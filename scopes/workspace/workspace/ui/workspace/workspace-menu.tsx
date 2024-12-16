import React from 'react';
import { Menu, MenuProps } from '@teambit/ui-foundation.ui.menu';
import { useWorkspaceMode } from '@teambit/workspace.ui.use-workspace-mode';

export const WorkspaceMenu = ({ menuSlot, widgetSlot, menuItemSlot, className }: MenuProps) => {
  const { isMinimal } = useWorkspaceMode();

  return (
    <Menu
      menuSlot={menuSlot}
      widgetSlot={widgetSlot}
      menuItemSlot={isMinimal ? undefined : menuItemSlot}
      className={className}
    />
  );
};
