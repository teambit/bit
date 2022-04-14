import { Section } from '@teambit/component';
import type { CodeUI } from './code.ui.runtime';

export class CodeCompareSection implements Section {
  constructor(private codeUI: CodeUI) {}
  route = {
    path: '~compare/:file*',
    children: this.codeUI.getCodeComparePage(),
  };
  navigationLink = {
    href: '~compare',
    children: 'Compare',
  };
  order = 50;
}
