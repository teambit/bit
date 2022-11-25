import { TabItem } from '@teambit/component.ui.component-compare.models.component-compare-props';

export function sortTabs({ order: first }: TabItem, { order: second }: TabItem) {
  return (first ?? 0) - (second ?? 0);
}
