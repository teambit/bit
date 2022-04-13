import { Section } from '@teambit/component';
import React from 'react';
import { MenuWidgetIcon } from '@teambit/ui-foundation.ui.menu-widget-icon';
import type { CodeUI } from './code.ui.runtime';

export class CodeDiffSection implements Section {
  constructor(private codeUI: CodeUI) {}
  route = {
    path: '~codediff/:file*',
    children: this.codeUI.getCodeDiffPage(),
  };
  navigationLink = {
    href: '~codediff',
    children: <MenuWidgetIcon icon="Code" tooltipContent="Code Diff" />,
    displayName: 'Code',
  };
  order = 20;
}
