import React from 'react';
import { Section } from '@teambit/component';
import { MenuWidgetIcon } from '@teambit/ui-foundation.ui.menu-widget-icon';
import { ChangeLogUI } from './changelog.ui.runtime';

export class ChangelogSection implements Section {
  constructor(private ui: ChangeLogUI) {}

  route = {
    path: '~changelog',
    element: this.ui.ChangeLog(),
  };

  navigationLink = {
    href: '~changelog',
    children: <MenuWidgetIcon icon="changelog" tooltipContent="Change log" />,
    displayName: 'Change log',
    hideInMinimalMode: true,
  };
  order = 40;
}
