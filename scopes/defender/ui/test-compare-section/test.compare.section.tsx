import { Section } from '@teambit/component';
import { TesterUI } from '@teambit/tester';
import { TabItem } from '@teambit/component.ui.component-compare.models.component-compare-props';
import { ChangeType } from '@teambit/component.ui.component-compare.models.component-compare-change-type';

export class TestCompareSection implements Section, TabItem {
  constructor(private tester: TesterUI) {}

  navigationLink = {
    href: 'tests',
    children: 'Tests',
  };

  props = this.navigationLink;

  route = {
    path: 'tests/*',
    element: this.tester.getTesterCompare(),
  };

  order = 50;
  id = 'tests';
  changeType = ChangeType.TESTS;
}
