import { CompositionsUI } from '@teambit/compositions';
import { Section } from '@teambit/component';
import { TabItem } from '@teambit/component.ui.component-compare.models.component-compare-props';

export class CompositionCompareSection implements Section, TabItem {
  constructor(private ui: CompositionsUI) {}

  navigationLink = {
    href: 'compositions',
    children: 'Preview',
  };

  props = this.navigationLink;

  route = {
    path: 'compositions/*',
    element: this.ui.getCompositionsCompare(),
  };

  order = 1;
  id = 'preview';
}
