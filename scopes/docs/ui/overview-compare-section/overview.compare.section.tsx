import { Section } from '@teambit/component';
import { DocsUI } from '@teambit/docs';

export class OverviewCompareSection implements Section {
  constructor(private docs: DocsUI) {}

  navigationLink = {
    href: 'docs',
    children: 'Docs',
  };

  route = {
    path: 'docs/*',
    element: this.docs.getDocsCompare(),
  };

  order = 40;
}
