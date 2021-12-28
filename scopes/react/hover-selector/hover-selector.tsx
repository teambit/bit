import React, { useCallback } from 'react';

export interface HoverSelectorProps extends React.HTMLAttributes<HTMLDivElement> {
  onElementChange?: (element: HTMLElement | null) => void;
  disabled?: boolean;
}

export function HoverSelector({ onElementChange, disabled, ...rest }: HoverSelectorProps) {
  const handlers = useHoverSelection(onElementChange, rest);

  return <div {...rest} {...(disabled ? {} : handlers)} />;
}

/**
 * create handlers for hover selection. fires `onChange` with the target element when hovering in,
 * and fires again with `null` when hovering out.
 * @returns the event handlers to be applied on the element (onMouseOver, onMouseLeave, etc)
 */
export function useHoverSelection<T extends HTMLElement = HTMLElement>(
  /** handle element selection. set `undefined` to disable the hook */
  onChange?: (element: HTMLElement | null) => void,
  /** existing props to extend. If props includes hover actions, they will be triggered when relevant */
  props: React.HTMLAttributes<T> = {}
) {
  const { onMouseOver, onMouseLeave } = props;

  const handleEnter = useCallback(
    (event: React.MouseEvent<T, MouseEvent>) => {
      onMouseOver?.(event);

      const { target } = event;
      if (!target) return;

      onChange?.(target as HTMLElement);
    },
    [onMouseOver, onChange]
  );

  const handleLeave = useCallback(
    (event: React.MouseEvent<T, MouseEvent>) => {
      onMouseLeave?.(event);
      onChange?.(null);
    },
    [onMouseLeave, onChange]
  );

  return onChange ? { onMouseOver: handleEnter, onMouseLeave: handleLeave } : {};
}
