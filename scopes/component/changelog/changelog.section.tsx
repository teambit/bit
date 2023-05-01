import React from 'react';
import { Section } from '@teambit/component';
import { MenuWidgetIcon } from '@teambit/ui-foundation.ui.menu-widget-icon';
import { ChangeLogPage } from './ui/change-log-page';

export class ChangelogSection implements Section {
  constructor(private host: string) {}

  route = {
    path: '~changelog',
    element: <ChangeLogPage host={this.host} />,
  };
  navigationLink = {
    href: '~changelog',
    children: <MenuWidgetIcon icon="changelog" tooltipContent="Change log" />,
    displayName: 'Change log',
  };
  order = 40;
}
