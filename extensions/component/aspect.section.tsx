import React from 'react';
import { Icon } from '@teambit/evangelist.elements.icon';
import { Section } from './section';
import { AspectPage } from './ui/aspect-page';

export class AspectSection implements Section {
  route = {
    path: '~aspect',
    children: <AspectPage />,
  };
  navigationLink = {
    href: '~aspect',
    children: <Icon of="Extension" />,
  };
  order = 50;
}
