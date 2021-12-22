import { Section } from '@teambit/component';
import React from 'react';
import { MenuWidgetIcon } from '@teambit/ui-foundation.ui.menu-widget-icon';
import type { CodeStatsUI } from './code-stats.ui.runtime';

export class CodeStatsSection implements Section {
  constructor(private codeStatsUI: CodeStatsUI) {}
  route = {
    path: '~codeStats/:file*',
    children: this.codeStatsUI.getCodeStatsPage(),
  };
  navigationLink = {
    href: '~codeStats',
    children: <MenuWidgetIcon icon="Info" tooltipContent="Code Stats" />,
  };
  order = 90;
}
