import { Section } from '@teambit/component';
import React from 'react';
import { ComponentPipelinePage } from '@teambit/component.ui.component-pipeline';

export class BuilderSection implements Section {
  constructor(private host: string) {}

  route = {
    path: '~component-pipeline',
    element: <ComponentPipelinePage host={this.host} />,
  };

  navigationLink = {
    href: '~component-pipeline',
    children: 'Pipeline',
  };

  order = 50;
}
