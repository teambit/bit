import { Section } from '@teambit/component';
import { ComponentCompareUI } from './component-compare.ui.runtime';

export class AspectsCompareSection implements Section {
  constructor(private compareUI: ComponentCompareUI) {}

  navigationLink = {
    href: 'aspects',
    children: 'Aspects',
    order: 6,
  };

  route = {
    path: 'aspects/*',
    element: this.compareUI.getAspectsComparePage(),
  };
}
