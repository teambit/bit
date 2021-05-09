import React, { useState, useCallback, useEffect } from 'react';
import classnames from 'classnames';
import { domToReact, toRootElement } from '@teambit/modules.dom-to-react';
import { HoverSelector } from '@teambit/ui.hover-selector';
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

    const bitComponent = bubbleToBitComponent(element, (elem) => !elem.hasAttribute('data-ignore-component-highlight'));
    if (!bitComponent) return;

    setTarget({
      element: bitComponent.element,
      id: bitComponent.id,
      scopeLink: undefined,
      link: bitComponent.homepage,
      local: bitComponent.exported === false,
    });
  }, []);

  const handleElement = useDebouncedCallback(_handleElement, target ? 180 : 0);

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
        id: meta.id || 'unknown',
        homepage: meta.homepage,
        exported: meta.exported,
      };
    }
  }

  return undefined;
}
