import React, { useEffect, ComponentType } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { domToReacts, toRootElement } from '@teambit/react.modules.dom-to-react';
import { useHoverSelection } from '@teambit/react.ui.hover-selector';
import {
  hasComponentMeta,
  ComponentMeta,
  ComponentMetaHolder,
} from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';

import { excludeHighlighterSelector } from '../ignore-highlighter';
import { HighlightTarget } from '../element-highlighter';
import { ruleMatcher, MatchRule, ComponentMatchRule, componentRuleMatcher } from '../rule-matcher';

export type useHoverHighlighterOptions = {
  debounceDuration: number;
  scopeClass: string;
  disabled?: boolean;
  rule?: MatchRule;
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

    const result = bubbleToBitComponent(
      element,
      rule ? (current) => ruleMatcher(current, rule) : undefined,
      componentRule ? (current) => componentRuleMatcher(current, componentRule) : undefined
    );
    if (!result) return;

    onChange({
      element: result.element,
      components: result.components,

      id: result.meta.id,
      scopeLink: undefined,
      link: result.meta.homepage,
      local: result.meta.exported === false,
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
  filter?: (elem: HTMLElement) => boolean,
  componentFilter?: (component: { meta: ComponentMeta }) => boolean
) {
  for (let current = element; current; current = current.parentElement) {
    current = toRootElement(current);
    if (!current || filter?.(current) === false) return undefined;

    const components = domToReacts(current);
    const componentsWithMeta = components.filter(hasComponentMeta) as (ComponentType & ComponentMetaHolder)[];

    if (componentsWithMeta.length > 0) {
      const main = componentsWithMeta.slice(-1).pop() as ComponentMetaHolder;
      const mainMeta = main.__bit_component;

      // skip components not matching filter
      if (componentFilter?.({ meta: mainMeta }) !== false) {
        return {
          element: current,
          component: main,
          meta: mainMeta,
          components: componentsWithMeta,
        };
      }
    }
  }

  return undefined;
}
