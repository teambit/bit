import React from 'react';
import { Section } from '@teambit/component';
import { MenuWidgetIcon } from '@teambit/ui-foundation.ui.menu-widget-icon';
import { ComponentCompareUI } from './component-compare.ui.runtime';
import { useWorkspaceMode } from '@teambit/workspace.ui.use-workspace-mode';

export class ComponentCompareSection implements Section {
  constructor(private componentCompare: ComponentCompareUI, private pinned: boolean) { }

  navigationLink = {
    href: '~compare',
    displayName: 'Compare',
    children: <CodeCompareMenuWidget />,
    hideInMinimalMode: !this.pinned,
  };

  route = {
    path: '~compare/*',
    element: this.componentCompare.getComponentComparePage(),
  };

  order = this.pinned ? 20 : 35;
}

function CodeCompareMenuWidget() {
  const { isMinimal } = useWorkspaceMode();
  if (!isMinimal) return null;
  return <MenuWidgetIcon icon="compare" tooltipContent="Compare" />;
}
