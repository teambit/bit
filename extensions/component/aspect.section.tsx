import React from 'react';
import { Section } from './section';
import { AspectPage } from './ui/aspect-page';

export class AspectSection implements Section {
  route = {
    path: '~aspect',
    children: <AspectPage />,
  };
  navigationLink = {
    href: '~aspect',
    children: 'Aspects',
  };
  order = 50;
}
