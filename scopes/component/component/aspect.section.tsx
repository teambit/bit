import React from 'react';
import { MenuWidgetIcon } from '@teambit/ui-foundation.ui.menu-widget-icon';
import { Section } from './section';
import { AspectPage } from './ui/aspect-page';

export class AspectSection implements Section {
  route = {
    path: '~aspect',
    element: <AspectPage />,
  };
  navigationLink = {
    href: '~aspect',
    children: <MenuWidgetIcon icon="configuration" tooltipContent="Configuration" />,
    displayName: 'Configuration',
  };
  order = 50;
}
