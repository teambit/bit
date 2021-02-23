import React, { useMemo, useState } from 'react';
import { usePopper } from 'react-popper';
import { ComponentID } from '@teambit/component-id';
import useAnimationFrame from 'use-animation-frame';
import type { Placement, Modifier } from '@popperjs/core';
import '@popperjs/core';

import { DefaultLabel } from './default-lable';
import { ComponentLabel } from './component-label';

import classes from './label.module.scss';

export interface LabelProps extends React.HTMLAttributes<HTMLDivElement> {
  targetRef: HTMLElement | null;
  offset?: [number, number];
  placement?: Placement;
  flip?: boolean;
  componentId: string;
  // children: ReactNode;
}

export function Label({
  targetRef,
  offset,
  placement,
  flip = true,
  componentId,
}: // children,
LabelProps) {
  const [sourceRef, setSourceRef] = useState<HTMLDivElement | null>(null);
  const parsedId = useMemo(() => {
    try {
      return ComponentID.fromString(componentId);
    } catch {
      return undefined;
    }
  }, [componentId]);

  const modifiers = useMemo<Partial<Modifier<any, any>>[]>(() => [{ name: 'offset', options: { offset } }], [
    flip,
    offset,
  ]);

  const { styles, attributes, update } = usePopper(targetRef, sourceRef, {
    modifiers,
    placement,
  });

  useAnimationFrame(() => update?.(), [update]);

  if (!targetRef) return null;

  return (
    <div
      ref={setSourceRef}
      className={classes.label}
      style={styles.popper}
      {...attributes.popper}
      data-ignore-component-highlight
    >
      {!parsedId && <DefaultLabel data-ignore-component-highlight>{componentId}</DefaultLabel>}
      {parsedId && <ComponentLabel componentId={parsedId} />}
    </div>
  );
}
