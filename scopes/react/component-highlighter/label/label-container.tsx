import React, { useLayoutEffect, useEffect, RefObject } from 'react';
import classnames from 'classnames';
import compact from 'lodash.compact';
import {
  useFloating,
  offset as offsetMiddleware,
  flip as flipMiddleware,
  shift,
  autoUpdate,
} from '@floating-ui/react-dom';
import type { Placement } from '@floating-ui/react-dom';
import styles from './label.module.scss';

export interface LabelContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  targetRef: RefObject<HTMLElement | null>;
  offset?: [number, number];
  placement?: Placement;
  flip?: boolean;
  /** continually update label position to match moving elements */
  watchMotion?: boolean;
}

export type { Placement };

export function LabelContainer({
  targetRef,
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
      offset && offsetMiddleware({ mainAxis: offset[0], crossAxis: offset[1] }),
      flip && flipMiddleware(),
      shift({ rootBoundary: 'viewport' }),
    ]),
  });

  useLayoutEffect(() => {
    reference(targetRef.current);
  }, [targetRef.current, reference]);

  // automatically update on scroll, resize, etc.
  // `watchMotion` will trigger continuous updates using animation frame
  useEffect(() => {
    if (!refs.reference.current || !refs.floating.current) return () => {};

    return autoUpdate(refs.reference.current, refs.floating.current, update, { animationFrame: !!watchMotion });
  }, [refs.reference.current, refs.floating.current, update, watchMotion]);

  const isReady = x !== null;

  return (
    <div
      {...rest}
      ref={floating}
      className={classnames(className, !isReady && styles.hidden)}
      style={{ ...style, position: strategy, top: y ?? '', left: x ?? '' }}
    />
  );
}
