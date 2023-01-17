import { CodeUI } from '@teambit/code';
import { ChangeType } from '@teambit/component.ui.component-compare.models.component-compare-change-type';
import { TabItem } from '@teambit/component.ui.component-compare.models.component-compare-props';
import { Section } from '@teambit/component';

export class CodeCompareSection implements Section, TabItem {
  constructor(private codeUI: CodeUI) {}

  navigationLink = {
    href: '.',
    children: 'Code',
    exact: true,
  };

  props = this.navigationLink;

  route = {
    path: '*',
    element: this.codeUI.getCodeCompare(),
  };

  order = 0;
  changeType = ChangeType.SOURCE_CODE;
  id = 'code';
}
