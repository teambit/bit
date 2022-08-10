import { Section } from '@teambit/component';
import React from 'react';
import { ComponentPipelinePage } from '@teambit/component.ui.pipelines.component-pipeline';
import { BuilderUI } from './builder.ui.runtime';

export class BuilderSection implements Section {
  constructor(private host: string, private builderUi: BuilderUI) {}

  route = {
    path: '~component-pipeline',
    element: <ComponentPipelinePage host={this.host} fileIconMatchers={this.builderUi.getFileIconMatchers()} />,
  };

  navigationLink = {
    href: '~component-pipeline',
    children: 'Pipeline',
  };

  order = 50;
}
