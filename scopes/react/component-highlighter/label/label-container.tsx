import React, { useLayoutEffect, useEffect } from 'react';
import compact from 'lodash.compact';
import {
  useFloating,
  offset as offsetMiddleware,
  flip as flipMiddleware,
  shift,
  autoUpdate,
} from '@floating-ui/react-dom';
import type { Placement } from '@floating-ui/react-dom';

export interface LabelContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  targetElement: HTMLElement | null;
  offset?: [number, number];
  placement?: Placement;
  flip?: boolean;
  /** continually update label position to match moving elements */
  watchMotion?: boolean;
}

export type { Placement };

// TODO - replace this with TippyJS, when it supports a `targetElement={targetRef.current}` prop
export function LabelContainer({
  targetElement,
  offset,
  placement,
  flip = true,
  watchMotion,
  className,
  style,
  ...rest
}: LabelContainerProps) {
  const { x, y, strategy, floating, reference, refs, update } = useFloating({
    placement,
    middleware: compact([
      offsetMiddleware(offset && { mainAxis: offset[0], crossAxis: offset[1] }),
      flip && flipMiddleware(),
      shift({ rootBoundary: 'viewport' }),
    ]),
  });

  useLayoutEffect(() => {
    reference(targetElement);
  }, [targetElement, reference]);

  // automatically update on scroll, resize, etc.
  // `watchMotion` will trigger continuous updates using animation frame
  useEffect(() => {
    if (!refs.reference.current || !refs.floating.current) return () => {};

    return autoUpdate(refs.reference.current, refs.floating.current, update, { animationFrame: !!watchMotion });
  }, [refs.reference.current, refs.floating.current, update, watchMotion]);

  if (!targetElement) return null;

  return (
    <div
      {...rest}
      ref={floating}
      className={className}
      style={{ ...style, position: strategy, top: y ?? '', left: x ?? '' }}
    />
  );
}
