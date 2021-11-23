import React, { useEffect } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { domToReact, toRootElement } from '@teambit/react.modules.dom-to-react';
import { useHoverSelection } from '@teambit/react.ui.hover-selector';
import { hasComponentMeta } from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';

import { excludeHighlighterSelector } from '../ignore-highlighter';
import { HighlightTarget } from '../element-highlighter';

export type useHoverHighlighterOptions = {
  debounceDuration: number;
  scopeClass: string;
  disabled?: boolean;
};

/** fires onChange when targeting a new component */
export function useHoverHighlighter<T extends HTMLElement = HTMLElement>(
  onChange: (target?: HighlightTarget) => void,
  props: React.HTMLAttributes<T> = {},
  { debounceDuration, scopeClass, disabled }: useHoverHighlighterOptions
) {
  const { handleElement } = useHoverHandler({ onChange, scopeClass, debounceDuration, disabled });

  const handlers = useHoverSelection(disabled ? undefined : handleElement, props);

  return handlers;
}

type useHoverHighlighterProps = {
  onChange: (target?: HighlightTarget) => void;
  scopeClass?: string;
  debounceDuration?: number;
  disabled?: boolean;
};

function useHoverHandler({ onChange, scopeClass = '', debounceDuration, disabled }: useHoverHighlighterProps) {
  // debounced method is ref'ed, so no need for useCallback
  const _handleElement = (element: HTMLElement | null) => {
    // clear highlighter at the edges:
    if (!element || element.hasAttribute('data-nullify-component-highlight')) {
      onChange(undefined);
      return;
    }

    // skip DOM trees having 'data-ignore-component-highlight'
    if (element.closest(`.${scopeClass} ${excludeHighlighterSelector}`)) return;

    const result = bubbleToBitComponent(element);
    if (!result) return;

    onChange({
      element: result.element,
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
function bubbleToBitComponent(element: HTMLElement | null, filter?: (elem: Element) => boolean) {
  for (let current = element; current; current = current.parentElement) {
    current = toRootElement(current);
    if (!current || filter?.(current) === false) return undefined;

    const component = domToReact(current);

    if (hasComponentMeta(component)) {
      const meta = component.__bit_component;

      return {
        element: current,
        component,
        meta,
      };
    }
  }

  return undefined;
}
