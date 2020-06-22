import React from 'react';
import { WorkspaceUI } from '../workspace/workspace.ui';
import { DocsSection } from '../stage-components/workspace-sections/docs-section';

const docsMock = {
  title: 'Radio',
  subTitle:
    'Radio Buttons are graphical interface elements that allow user to choose only one of a predefined set of mutually exclusive options.',
  labels: ['chart', 'graph', 'ui-components', 'react'],
  installMethods: [
    { title: 'install package', content: '@google.material-ui/radio' },
    {
      title: 'Import from CDN',
      content: 'https://esm.bit.dev/@google/material-ui/radio/'
    }
  ]
};

export class DocsUI {
  static dependencies = [WorkspaceUI];

  static async provider([workspace]: [WorkspaceUI]) {
    workspace.registerMenuItem({
      label: 'Overview',
      onClick: () => workspace.open(<DocsSection {...docsMock} />)
    });
    return new DocsUI();
  }
}
