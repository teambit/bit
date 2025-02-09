import { Section } from '@teambit/component';
import React from 'react';
import { MenuWidgetIcon } from '@teambit/ui-foundation.ui.menu-widget-icon';
import { useWorkspaceMode } from '@teambit/workspace.ui.use-workspace-mode';
import type { CodeUI } from './code.ui.runtime';

export class CodeSection implements Section {
  constructor(private codeUI: CodeUI, private pinned: boolean) { }
  route = {
    path: '~code/*',
    element: this.codeUI.getCodePage(),
  };
  navigationLink = {
    href: '~code',
    children: <CodeMenuWidget />,
    displayName: 'Code',
    hideInMinimalMode: !this.pinned
  };
  order = this.pinned ? 0 : 30;
}

function CodeMenuWidget() {
  const { isMinimal } = useWorkspaceMode();
  if (!isMinimal) return null;
  return <MenuWidgetIcon icon="Code" tooltipContent="Code" />;
}
