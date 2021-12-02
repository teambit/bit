import React, { useMemo, useState } from 'react';
import { usePopper } from 'react-popper';
import type { Placement, Modifier } from '@popperjs/core';
import '@popperjs/core';

import { useAnimationFrame } from '../use-animation-frame';

export interface LabelContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  targetRef: HTMLElement | null;
  offset?: [number, number];
  placement?: Placement;
  flip?: boolean;
  /** continually update label position to match moving elements */
  watchMotion?: boolean;
}

export type { Placement };

// TODO - replace this with TippyJS, when it supports a `targetElement={targetRef.current}` prop
export function LabelContainer({
  targetRef,
  offset,
  placement,
  flip = true,
  watchMotion,
  className,
  ...rest
}: LabelContainerProps) {
  const [sourceRef, setSourceRef] = useState<HTMLDivElement | null>(null);

  const modifiers = useMemo<Partial<Modifier<any, any>>[]>(
    () => [{ name: 'offset', options: { offset } }],
    [flip, offset]
  );

  const { styles, attributes, update } = usePopper(targetRef, sourceRef, {
    modifiers,
    placement,
  });

  useAnimationFrame(!!watchMotion && update);

  if (!targetRef) return null;

  return <div {...rest} ref={setSourceRef} className={className} style={styles.popper} {...attributes.popper} />;
}
