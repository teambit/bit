import React, { useState, useCallback, useEffect } from 'react';
import classnames from 'classnames';
import { domToReact, toRootElement } from '@teambit/modules.dom-to-react';
import { HoverSelector } from '@teambit/ui.hover-selector';
import { Frame } from '../frame';
import { Label, LabelContainer } from '../label';
import { isBitComponent } from './bit-react-component';

import styles from './component-highlighter.module.scss';

export interface ComponentHighlightProps extends React.HTMLAttributes<HTMLDivElement> {
  disabled?: boolean;
}

export function ComponentHighlighter({ children, disabled, ...rest }: ComponentHighlightProps) {
  const [text, setText] = useState<string | undefined>(undefined);
  const [target, setTarget] = useState<HTMLElement | null>(null);

  const handleElement = useCallback((element: HTMLElement | null) => {
    if (!element) {
      setTarget(null);
      setText(undefined);
      return;
    }

    const bitComponent = bubbleToBitComponent(element, (elem) => !elem.hasAttribute('data-ignore-component-highlight'));
    if (!bitComponent) return;

    setText(bitComponent.id);
    setTarget(bitComponent.element);
  }, []);

  useEffect(() => {
    if (disabled) {
      setTarget(null);
      setText(undefined);
    }
  }, [disabled]);

  return (
    <HoverSelector
      {...rest}
      className={classnames(styles.highlighter, !disabled && styles.active)}
      onElementChange={handleElement}
      disabled={disabled}
      style={{ fontFamily: 'sans-serif' }}
      data-ignore-component-highlight
    >
      {children}
      <Frame targetRef={target} data-ignore-component-highlight />
      {text && (
        <LabelContainer targetRef={target} offset={[0, 8]} placement="top" data-ignore-component-highlight>
          <Label componentId={text} data-ignore-component-highlight />
        </LabelContainer>
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
        id: component.__bitComponentId || 'unknown',
      };
  }

  return undefined;
}
