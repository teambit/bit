import { Section } from '@teambit/component';
import { DocsUI } from '@teambit/docs';

export class OverviewCompareSection implements Section {
  constructor(private docs: DocsUI) {}

  navigationLink = {
    href: 'docs',
    children: 'Docs',
    order: 4,
  };

  route = {
    path: 'docs/*',
    element: this.docs.getDocsCompare(),
  };
  // navigationLink = {
  //   href: '.',
  //   children: 'Overview',
  //   exact: true,
  //   order: 0,
  // };

  // route = {
  //   path: '*',
  //   element: this.docs.getDocsCompare(),
  // };
}
