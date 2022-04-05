import React, { useEffect } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { useHoverSelection } from '@teambit/react.ui.hover-selector';
import { ComponentMetaHolder } from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';

import { excludeHighlighterSelector, skipHighlighterSelector } from '../ignore-highlighter';
import { MatchRule, ComponentMatchRule } from '../rule-matcher';
import { bubbleToComponent } from './bubble-to-component';

type HighlightTarget = { element: HTMLElement; components: ComponentMetaHolder[] };
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

    // clear when ancestor has 'data-ignore-component-highlight'
    if (element.closest(`.${scopeClass} ${excludeHighlighterSelector}`)) {
      onChange(undefined);
      return;
    }

    // skip DOM trees having 'data-skip-component-highlight'
    if (element.closest(`.${scopeClass} ${skipHighlighterSelector}`)) return;

    const result = bubbleToComponent(element, { elementRule: rule, componentRule });
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
