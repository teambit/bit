import { CodeUI } from '@teambit/code';
import { Section } from '@teambit/component';

export class CodeCompareSection implements Section {
  constructor(private codeUI: CodeUI) {}

  navigationLink = {
    href: 'code',
    children: 'Code',
    order: 4,
  };

  route = {
    path: 'code/*',
    element: this.codeUI.getCodeCompare(),
  };
}
