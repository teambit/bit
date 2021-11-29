// in the future, we will add more options here, like include / exclude objects.

import { ComponentMeta } from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';

export type MatchRule = undefined | string | ((element: HTMLElement) => boolean);
export type ComponentMatchRule = undefined | string | string[] | ((target: ComponentMatchTarget) => boolean);

export function ruleMatcher(element: HTMLElement, rule: MatchRule) {
  if (typeof rule === 'string') {
    return element.matches(rule);
  }

  if (typeof rule === 'function') {
    return rule(element);
  }

  return true;
}

export type ComponentMatchTarget = { meta: ComponentMeta };

export function componentRuleMatcher(target: ComponentMatchTarget, rule: ComponentMatchRule): boolean {
  if (typeof rule === 'string') {
    return target.meta.id === rule;
  }

  if (Array.isArray(rule)) {
    return rule.includes(target.meta.id);
  }

  if (typeof rule === 'function') {
    return rule(target);
  }

  return true;
}
