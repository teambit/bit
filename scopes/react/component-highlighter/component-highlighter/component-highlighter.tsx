import React, { useState, useCallback, useEffect } from 'react';
import classnames from 'classnames';
import { domToReact, toRootElement } from '@teambit/react.modules.dom-to-react';
import { HoverSelector } from '@teambit/react.ui.hover-selector';
import { useDebouncedCallback } from 'use-debounce';
import { Frame } from '../frame';
import { Label, LabelContainer } from '../label';
import { hasComponentMeta } from './bit-react-component';

import styles from './component-highlighter.module.scss';

type HighlightTarget = {
  id?: string;
  element: HTMLElement;
  /** e.g. 'https://bit.dev/teambit/base-ui/elements/dots-loader', */
  link?: string;
  /** e.g. 'https://bit.dev/teambit/base-ui' */
  scopeLink?: string;
  /** use full production url, or local workspace url */
  local?: boolean;
};

export interface ComponentHighlightProps extends React.HTMLAttributes<HTMLDivElement> {
  disabled?: boolean;
}

export function ComponentHighlighter({ children, disabled, ...rest }: ComponentHighlightProps) {
  const [target, setTarget] = useState<HighlightTarget | undefined>();

  const _handleElement = useCallback((element: HTMLElement | null) => {
    if (!element || element?.hasAttribute('data-nullify-component-highlight')) {
      setTarget(undefined);
      return;
    }

    const result = bubbleToBitComponent(element, (elem) => !elem.hasAttribute('data-ignore-component-highlight'));
    if (!result) return;

    setTarget({
      element: result.element,
      id: result.meta.id,
      scopeLink: undefined,
      link: result.meta.homepage,
      local: result.meta.exported === false,
    });
  }, []);

  const handleElement = useDebouncedCallback(_handleElement, target ? 80 : 0);

  useEffect(() => {
    if (disabled) {
      setTarget(undefined);
    }
  }, [disabled]);

  return (
    <HoverSelector
      {...rest}
      className={classnames(styles.highlighter, !disabled && styles.active)}
      onElementChange={handleElement}
      disabled={disabled}
      data-nullify-component-highlight
    >
      {children}
      {target && (
        <>
          <Frame targetRef={target.element} data-ignore-component-highlight />
          {target.id && (
            <LabelContainer
              className={styles.label}
              targetRef={target.element}
              placement="top"
              data-ignore-component-highlight
            >
              <Label
                componentId={target.id}
                link={target.link}
                scopeLink={target.scopeLink}
                local={target.local}
                data-ignore-component-highlight
              />
            </LabelContainer>
          )}
        </>
      )}
    </HoverSelector>
  );
}

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
