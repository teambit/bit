import { Section } from '@teambit/component';
import { TesterUI } from '@teambit/tester';

export class TestCompareSection implements Section {
  constructor(private tester: TesterUI) {}

  navigationLink = {
    href: 'tests',
    children: 'Tests',
  };

  route = {
    path: 'tests/*',
    element: this.tester.getTesterCompare(),
  };

  order = 30;
}
