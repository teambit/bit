import { Section } from '@teambit/component';
import React from 'react';
import { TestsPage } from './ui/tests-page';

export class TestsSection implements Section {
  route = {
    path: '~tests',
    children: <TestsPage />,
  };
  navigationLink = {
    href: '~tests',
    children: 'Tests',
  };
  order = 40;
}
