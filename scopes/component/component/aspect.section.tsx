import React from 'react';
import { MenuWidgetIcon } from '@teambit/ui.menu-widget-icon';
import { Section } from './section';
import { AspectPage } from './ui/aspect-page';

export class AspectSection implements Section {
  route = {
    path: '~aspect',
    children: <AspectPage />,
  };
  navigationLink = {
    href: '~aspect',
    children: <MenuWidgetIcon icon="settings" tooltipContent="Configuration" />,
  };
  order = 50;
}
