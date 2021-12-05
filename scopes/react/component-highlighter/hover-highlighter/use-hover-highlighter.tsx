import React, { useEffect } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { domToReacts, toRootElement } from '@teambit/react.modules.dom-to-react';
import { useHoverSelection } from '@teambit/react.ui.hover-selector';
import { hasComponentMeta } from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';

import { excludeHighlighterSelector } from '../ignore-highlighter';
import { HighlightTarget } from '../element-highlighter';
import { ruleMatcher, MatchRule, ComponentMatchRule, componentRuleMatcher } from '../rule-matcher';

export type useHoverHighlighterOptions = {
  debounceDuration: number;
  scopeClass: string;
  disabled?: boolean;
  /** filter highlighter targets by this query selector. (May be a more complex object in the future) */
  rule?: MatchRule;
  /** filter targets by this component match rule */
  componentRule?: ComponentMatchRule;
};

/** fires onChange when targeting a new component */
export function useHoverHighlighter<T extends HTMLElement = HTMLElement>(
  onChange: (target?: HighlightTarget) => void,
  props: React.HTMLAttributes<T> = {},
  { debounceDuration, scopeClass, disabled, rule, componentRule }: useHoverHighlighterOptions
) {
  const { handleElement } = useHoverHandler({ onChange, scopeClass, debounceDuration, disabled, rule, componentRule });

  const handlers = useHoverSelection(disabled ? undefined : handleElement, props);

  return handlers;
}

type useHoverHighlighterProps = {
  onChange: (target?: HighlightTarget) => void;
  scopeClass?: string;
  debounceDuration?: number;
  disabled?: boolean;
  rule?: MatchRule;
  componentRule?: ComponentMatchRule;
};

function useHoverHandler({
  onChange,
  scopeClass = '',
  debounceDuration,
  disabled,
  rule,
  componentRule,
}: useHoverHighlighterProps) {
  // debounced method is ref'ed, so no need for useCallback
  const _handleElement = (element: HTMLElement | null) => {
    // clear highlighter at the edges:
    if (!element || element.hasAttribute('data-nullify-component-highlight')) {
      onChange(undefined);
      return;
    }

    // skip DOM trees having 'data-ignore-component-highlight'
    if (element.closest(`.${scopeClass} ${excludeHighlighterSelector}`)) return;

    const result = bubbleToBitComponent(element, rule, componentRule);
    if (!result) return;

    onChange({
      element: result.element,
      components: result.components,
    });
  };

  const handleElement = useDebouncedCallback(_handleElement, debounceDuration);

  // clear when disabling
  useEffect(() => {
    if (disabled) handleElement.cancel();
  }, [disabled, handleElement]);

  return { handleElement };
}

/** go up the dom tree until reaching a react bit component */
function bubbleToBitComponent(
  element: HTMLElement | null,
  elementRule?: MatchRule,
  componentRule?: ComponentMatchRule
) {
  for (let current = element; current; current = current.parentElement) {
    current = toRootElement(current);
    if (!current) return undefined;
    if (ruleMatcher(current, elementRule)) {
      const component = domToReacts(current);

      if (hasComponentMeta(component)) {
        const meta = component.__bit_component;

        if (componentRuleMatcher({ meta }, componentRule))
          return {
            element: current,
            component,
            meta,
          };
      }
    }
  }

  return undefined;
}
