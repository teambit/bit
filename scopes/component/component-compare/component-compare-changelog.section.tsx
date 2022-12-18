import { Section } from '@teambit/component';
import { ComponentCompareUI } from './component-compare.ui.runtime';

export class CompareChangelogSection implements Section {
  constructor(private compareUI: ComponentCompareUI) {}

  navigationLink = {
    href: 'changelog',
    children: 'Changelog',
    order: 5,
  };

  route = {
    path: 'changelog/*',
    element: this.compareUI.getChangelogComparePage(),
  };
}
