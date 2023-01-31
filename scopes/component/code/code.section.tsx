import { Section } from '@teambit/component';
import React from 'react';
import { MenuWidgetIcon } from '@teambit/ui-foundation.ui.menu-widget-icon';
import { ChangeType } from '@teambit/component.ui.component-compare.models.component-compare-change-type';
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
  changeType = ChangeType.SOURCE_CODE;
  order = 30;
}
