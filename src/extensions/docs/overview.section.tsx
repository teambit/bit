import React from 'react';
import { Section } from '../component/section';
import { DocsUI } from './docs.ui';
import { Overview } from './overview';

export class OverviewSection implements Section {
  constructor(
    /**
     * docs ui extension.
     */
    private docs: DocsUI
  ) {}

  navigationLink = {
    href: '',
    exact: true,
    children: 'Overview',
  };

  route = {
    path: '',
    exact: true,
    children: <Overview />,
  };
}
