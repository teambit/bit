import { Section } from '@teambit/component';
import React from 'react';
import { ComponentArtifactPage } from '@teambit/component.ui.component-artifact';

export class ComponentArtifactSection implements Section {
  constructor(private host: string) {}

  route = {
    path: '~component-artifact',
    element: <ComponentArtifactPage host={this.host} />,
  };

  navigationLink = {
    href: '~component-artifact',
    children: 'Build Artifacts',
  };

  order = 50;
}
