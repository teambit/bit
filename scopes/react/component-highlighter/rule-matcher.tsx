// in the future, we will add more options here, like include / exclude objects.
import { ComponentID } from '@teambit/component-id';
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
    return ComponentID.isEqualStr(target.meta.id, rule, { ignoreVersion: true });
  }

  if (Array.isArray(rule)) {
    return rule.some((x) => ComponentID.isEqualStr(target.meta.id, x, { ignoreVersion: true }));
  }

  if (typeof rule === 'function') {
    return rule(target);
  }

  return true;
}
