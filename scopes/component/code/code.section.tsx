import { Section } from '@teambit/component';
import React from 'react';
import { MenuWidgetIcon } from '@teambit/ui-foundation.ui.menu-widget-icon';
import type { CodeUI } from './code.ui.runtime';

export class CodeSection implements Section {
  constructor(private codeUI: CodeUI) {}
  route = {
    path: '~code/*',
    element: this.codeUI.getCodePage(),
  };
  navigationLink = {
    href: '~code',
    children: <MenuWidgetIcon icon="Code" tooltipContent="Code" />,
    displayName: 'Code',
  };
  order = 30;
}
