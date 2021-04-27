import React, { useState, useCallback, useEffect } from 'react';
import classnames from 'classnames';
import { domToReact, toRootElement } from '@teambit/modules.dom-to-react';
import { HoverSelector } from '@teambit/ui.hover-selector';
import { useDebouncedCallback } from 'use-debounce';
import { Frame } from '../frame';
import { Label, LabelContainer } from '../label';
import { isBitComponent } from './bit-react-component';

import styles from './component-highlighter.module.scss';

type HighlightTarget = {
  id?: string;
  element: HTMLElement | null;
  link?: string;
  scopeLink?: string;
};

export interface ComponentHighlightProps extends React.HTMLAttributes<HTMLDivElement> {
  disabled?: boolean;
}

export function ComponentHighlighter({ children, disabled, ...rest }: ComponentHighlightProps) {
  const [target, setTarget] = useState<HighlightTarget | undefined>();

  const _handleElement = useCallback((element: HTMLElement | null) => {
    if (!element) {
      setTarget(undefined);
      return;
    }

    const bitComponent = bubbleToBitComponent(element, (elem) => !elem.hasAttribute('data-ignore-component-highlight'));
    if (!bitComponent) return;

    setTarget({
      element: bitComponent.element,
      id: bitComponent.id,
      scopeLink: undefined, // 'https://bit.dev/teambit/base-ui',
      link: bitComponent.homepage,
    });
  }, []);

  const handleElement = useDebouncedCallback(_handleElement, target ? 300 : 0);

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
      data-ignore-component-highlight
    >
      {children}
      {target && (
        <>
          <Frame targetRef={target.element} data-ignore-component-highlight />
          {target.id && (
            <LabelContainer
              targetRef={target.element}
              placement="top"
              data-ignore-component-highlight
              className={styles.label}
            >
              <Label
                componentId={target.id}
                link={target.link}
                scopeLink={target.link}
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

    if (isBitComponent(component))
      return {
        element: current,
        component,
        id: component.__bit_component.id || 'unknown',
        homepage: component.__bit_component.homepage,
      };
  }

  return undefined;
}
