import React, { useCallback } from 'react';

interface MouseSelectorProps extends React.HTMLAttributes<HTMLDivElement> {
  onElementChange?: (element: HTMLElement | null) => void;
  disabled?: boolean;
}

export function MouseHoverSelector({
  onElementChange,
  onMouseOver,
  onMouseLeave,
  disabled,
  ...rest
}: MouseSelectorProps) {
  const handleEnter = useCallback(
    (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      onMouseOver?.(event);

      const { target } = event;
      if (!target) return;

      onElementChange?.(target as HTMLElement);
    },
    [onMouseOver, onElementChange]
  );

  const handleLeave = useCallback(
    (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      onMouseLeave?.(event);
      onElementChange?.(null);
    },
    [onMouseLeave, onElementChange]
  );

  return (
    <div
      {...rest}
      onMouseOver={disabled ? onMouseOver : handleEnter}
      onMouseLeave={disabled ? onMouseLeave : handleLeave}
    />
  );
}
