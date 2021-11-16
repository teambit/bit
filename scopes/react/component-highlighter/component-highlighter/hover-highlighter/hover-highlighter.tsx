import React, { useState, useCallback, useEffect, CSSProperties } from 'react';
import classnames from 'classnames';
import { useDebouncedCallback } from 'use-debounce';
import { domToReact, toRootElement } from '@teambit/react.modules.dom-to-react';
import { HoverSelector } from '@teambit/react.ui.hover-selector';
import { hasComponentMeta } from '../bit-react-component';

import styles from './hover-highlighter.module.scss';
import { excludeHighlighterSelector } from '../../ignore-highlighter';
import { ElementHighlighter, HighlightTarget, Placement, HighlightClasses } from '../../element-highlighter';

export interface HoverHighlighterProps extends React.HTMLAttributes<HTMLDivElement> {
  disabled?: boolean;
  /** default pop location for the label */
  placement?: Placement;
  /** customize styles */
  classes?: HighlightClasses;
  /** customize highlighter */
  highlightStyle?: CSSProperties;
  /** debounces element hover selection.
   * A higher value will reduce element lookups as well as "keep" the highlight on the current element for longer.
   * Initial selection (when no element is currently selected) will always happen immediately to improve the user experience.
   * @default 80ms
   */
  debounceSelection?: number;
}

/** automatically highlight components on hover */
export function HoverHighlighter({
  children,
  disabled,
  classes,
  highlightStyle,
  placement,
  debounceSelection = 80,
  ...rest
}: HoverHighlighterProps) {
  const [target, setTarget] = useState<HighlightTarget | undefined>();

  const _handleElement = useCallback((element: HTMLElement | null) => {
    // clear highlighter at the edges:
    if (!element || element.hasAttribute('data-nullify-component-highlight')) {
      setTarget(undefined);
      return;
    }

    // skip DOM trees having 'data-ignore-component-highlight'
    if (element.closest(excludeHighlighterSelector)) return;

    const result = bubbleToBitComponent(element);
    if (!result) return;

    setTarget({
      element: result.element,
      id: result.meta.id,
      scopeLink: undefined,
      link: result.meta.homepage,
      local: result.meta.exported === false,
    });
  }, []);

  const handleElement = useDebouncedCallback(_handleElement, target ? debounceSelection : 0);

  // clear target when disabled
  useEffect(() => {
    if (disabled) {
      setTarget(undefined);
    }
  }, [disabled]);

  return (
    <>
      <HoverSelector
        {...rest}
        className={classnames(styles.highlighter, !disabled && styles.active)}
        onElementChange={handleElement}
        disabled={disabled}
        data-nullify-component-highlight
      >
        {children}
      </HoverSelector>
      {target && (
        <ElementHighlighter
          target={target}
          classes={classes}
          style={highlightStyle}
          placement={placement}
          // could also achieve this by moving the ElementHighlighter into HoverSelector.
          // it will be ignored thanks to the excludeHighlighter attribute.
          onMouseEnter={handleElement.cancel}
        />
      )}
    </>
  );
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
