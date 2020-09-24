import React from 'react';
import { Section } from './section';
// import { TestsPage } from './ui/tests-page';

export class AspectSection implements Section {
  route = {
    path: '~aspect',
    children: <div>aspects</div>,
  };
  navigationLink = {
    href: '~aspect',
    children: 'Aspects',
  };
  order = 50;
}
