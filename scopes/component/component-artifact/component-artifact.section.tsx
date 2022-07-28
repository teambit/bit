import { Section } from '@teambit/component';
import React from 'react';
import { ComponentArtifactPage } from './ui/component-artifact-page';

export class ComponentArtifactSection implements Section {
  constructor(private host: string) {}

  route = {
    path: '~component-artifact',
    element: <ComponentArtifactPage host={this.host} />,
  };

  navigationLink = {
    href: '~component-artifact',
    children: 'Artifacts',
  };

  order = 50;
}
