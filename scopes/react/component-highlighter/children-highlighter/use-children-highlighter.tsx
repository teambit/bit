import { useEffect, RefObject } from 'react';
import getXPath from 'get-xpath';
import { domToReacts, toRootElement } from '@teambit/react.modules.dom-to-react';
import {
  componentMetaField,
  hasComponentMeta,
  ReactComponentMetaHolder,
} from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';
import { HighlightTarget } from '../element-highlighter';
import { excludeHighlighterSelector } from '../ignore-highlighter';
import { ruleMatcher, MatchRule, ComponentMatchRule, componentRuleMatcher } from '../rule-matcher';

export type ChildrenHighlighterOptions = {
  onChange: (highlighterTargets: Record<string, HighlightTarget>) => void;
  disabled?: boolean;
  scopeRef: RefObject<HTMLElement>;
  scopeClass?: string;
  /** filter highlighter targets by this query selector. (May be a more complex object in the future) */
  rule?: MatchRule;
  componentRule?: ComponentMatchRule;

  // /** automatically update when children update. Use with caution, might be slow */
  // watchDom?: boolean;
};

export function useChildrenHighlighter({
  onChange,
  disabled,
  scopeRef,
  scopeClass: scopeSelector = '',
  rule,
  componentRule,
}: ChildrenHighlighterOptions) {
  useEffect(() => {
    const nextTargets: Record<string, HighlightTarget> = {};
    const scopeElement = scopeRef.current;
    if (!scopeElement || disabled) return;

    // select all elements (except excluded)
    let allElements = Array.from(scopeElement.querySelectorAll<HTMLElement>(targetsSelector(`.${scopeSelector}`)));
    // apply rule filtering
    if (rule) allElements = allElements.filter((elem) => ruleMatcher(elem, rule));
    // seek the root element:
    const rootElements = allElements.map(toRootElement).filter((x) => !!x);
    // deduplicate
    const uniqueRoots = new Set(rootElements);

    uniqueRoots.forEach((element) => {
      if (!element) return;
      const comps = domToReacts(element);
      const componentsWithMeta = comps.filter(
        (x) => hasComponentMeta(x) && componentRuleMatcher({ meta: x[componentMetaField] }, componentRule)
      ) as ReactComponentMetaHolder[];

      if (componentsWithMeta.length < 1) return;

      const key = getXPath(element);

      nextTargets[key] = { element, components: componentsWithMeta };
    });

    onChange(nextTargets);
  }, [disabled, scopeSelector]);
}

function targetsSelector(
  /**
   * the scope in which to consider the exclude selector.
   * The `:scope` modifier is appropriate, but is not supported in older browsers.
   */
  scopeSelector = ':scope'
) {
  return `:not(${scopeSelector} ${excludeHighlighterSelector}, ${scopeSelector} ${excludeHighlighterSelector} *)`;
}
