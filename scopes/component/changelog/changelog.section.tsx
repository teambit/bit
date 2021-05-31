import { Section } from '@teambit/component';
import React from 'react';
import { MenuWidgetIcon } from '@teambit/ui-foundation.ui.menu-widget-icon';
import { ChangeLogPage } from './ui/change-log-page';

export class ChangelogSection implements Section {
  route = {
    path: '~changelog',
    children: <ChangeLogPage />,
  };
  navigationLink = {
    href: '~changelog',
    children: <MenuWidgetIcon icon="changelog" tooltipContent="Change log" />,
  };
  order = 30;
}
