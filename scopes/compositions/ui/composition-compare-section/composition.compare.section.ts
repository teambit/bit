import { CompositionsUI } from '@teambit/compositions';
import { Section } from '@teambit/component';

export class CompositionCompareSection implements Section {
  constructor(private ui: CompositionsUI) {}

  navigationLink = {
    href: 'compositions',
    children: 'Compositions',
    order: 1,
  };

  route = {
    path: 'compositions/*',
    element: this.ui.getCompositionsCompare(),
  };
}
