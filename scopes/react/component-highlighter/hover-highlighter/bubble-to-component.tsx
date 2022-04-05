import { domToReacts, toRootElement } from '@teambit/react.modules.dom-to-react';
import {
  componentMetaField,
  hasComponentMeta,
  ReactComponentMetaHolder,
} from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';
import { ruleMatcher, MatchRule, ComponentMatchRule, componentRuleMatcher } from '../rule-matcher';

type BubblingOptions = {
  /** filter elements by this rule */
  elementRule?: MatchRule;
  /** filter components by this rule */
  componentRule?: ComponentMatchRule;
  /**
   * continue bubbling when encountering a parent of the same component
   * @default true
   */
  propagateSameParents?: boolean;
};

/** go up the dom tree until reaching a react bit component */
export function bubbleToComponent(
  element: HTMLElement | null,
  { elementRule, componentRule, propagateSameParents = true }: BubblingOptions = {}
) {
  let current = bubbleToFirstComponent(element, elementRule, componentRule);
  if (!propagateSameParents) return current;

  while (current) {
    const parentElement = current.element.parentElement;
    const parent = bubbleToFirstComponent(parentElement, elementRule, componentRule);

    const primeComponent = current?.components.slice(-1).pop();
    const parentPrimeComponent = parent?.components.slice(-1).pop();

    if (primeComponent?.[componentMetaField].id !== parentPrimeComponent?.[componentMetaField].id) return current;

    current = parent;
  }

  return undefined;
}

/** go up the dom tree until reaching a react bit component */
function bubbleToFirstComponent(
  element: HTMLElement | null,
  elementRule?: MatchRule,
  componentRule?: ComponentMatchRule
) {
  for (let current = element; current; current = current.parentElement) {
    current = toRootElement(current);
    if (!current) return undefined;
    if (ruleMatcher(current, elementRule)) {
      const components = domToReacts(current);

      const relevantComponents = components.filter(
        (x) => hasComponentMeta(x) && componentRuleMatcher({ meta: x[componentMetaField] }, componentRule)
      ) as ReactComponentMetaHolder[];

      if (relevantComponents.length < 1) return undefined;
      return {
        element: current,
        components: relevantComponents,
      };
    }
  }

  return undefined;
}
