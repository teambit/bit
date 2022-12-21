import { Section } from '@teambit/component';
import { DocsUI } from '@teambit/docs';
import { TabItem } from '@teambit/component.ui.component-compare.models.component-compare-props';

export class OverviewCompareSection implements Section, TabItem {
  constructor(private docs: DocsUI) {}

  navigationLink = {
    href: 'docs',
    children: 'Docs',
  };

  props = this.navigationLink;

  route = {
    path: 'docs/*',
    element: this.docs.getDocsCompare(),
  };

  order = 40;
  id = 'docs';
}
