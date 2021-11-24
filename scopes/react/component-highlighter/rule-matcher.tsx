// in the future, we will add more options here, like include / exclude objects.

export type MatchRule = undefined | string | ((element: HTMLElement) => boolean);

export function ruleMatcher(element: HTMLElement, rule: MatchRule) {
  if (typeof rule === 'string') {
    return element.matches(rule);
  }

  if (typeof rule === 'function') {
    return rule(element);
  }

  return true;
}
