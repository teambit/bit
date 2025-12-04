import type { CompositionsUI } from '@teambit/compositions';
import type { Section } from '@teambit/component';
import type { TabItem } from '@teambit/component.ui.component-compare.models.component-compare-props';

export class CompositionCompareSection implements Section, TabItem {
  constructor(private ui: CompositionsUI) {}

  navigationLink = {
    href: 'compositions',
    children: 'Preview',
  };

  props = this.navigationLink;

  route: Section['route'] = {
    path: 'compositions/*',
    element: this.ui.getCompositionsCompare(),
  };

  order = 1;
  id = 'preview';
}
