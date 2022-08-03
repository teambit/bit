import { Section } from '@teambit/component';
import React from 'react';
import { ComponentPipelinePage } from '@teambit/component.ui.component-pipeline';

export class BuilderSection implements Section {
  constructor(private host: string) {}

  route = {
    path: '~component-artifact',
    element: <ComponentPipelinePage host={this.host} />,
  };

  navigationLink = {
    href: '~component-artifact',
    children: 'Build Artifacts',
  };

  order = 50;
}
