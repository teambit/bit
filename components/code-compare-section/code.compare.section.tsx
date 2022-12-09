import { CodeUI } from '@teambit/code';
import { Section } from '@teambit/component';

export class CodeCompareSection implements Section {
  constructor(private codeUI: CodeUI) {}

  navigationLink = {
    href: '.',
    children: 'Code',
    exact: true,
  };

  route = {
    path: '*',
    element: this.codeUI.getCodeCompare(),
  };

  order = 0;
}
