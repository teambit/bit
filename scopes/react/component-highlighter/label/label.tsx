import React, { useMemo, useState } from 'react';
import { usePopper } from 'react-popper';
import { ComponentID } from '@teambit/component-id';
import type { CardProps } from '@teambit/base-ui.surfaces.card';
import useAnimationFrame from 'use-animation-frame';
import type { Placement, Modifier } from '@popperjs/core';
import '@popperjs/core';

import { DefaultLabel } from './default-lable';
import { ComponentLabel } from './component-label';

import classes from './label.module.scss';

export interface LabelContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  targetRef: HTMLElement | null;
  offset?: [number, number];
  placement?: Placement;
  flip?: boolean;
}

// TODO - replace this with TippyJS, when it supports a `targetElement={targetRef.current}` prop
export function LabelContainer({ targetRef, offset, placement, flip = true, ...rest }: LabelContainerProps) {
  const [sourceRef, setSourceRef] = useState<HTMLDivElement | null>(null);

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

  return <div {...rest} ref={setSourceRef} className={classes.label} style={styles.popper} {...attributes.popper} />;
}

export interface LabelProps extends CardProps {
  componentId: string;
}

export function Label({ componentId, ...rest }: LabelProps) {
  const parsedId = useMemo(() => {
    try {
      return ComponentID.fromString(componentId);
    } catch {
      return undefined;
    }
  }, [componentId]);

  if (!parsedId) return <DefaultLabel {...rest}>{componentId}</DefaultLabel>;

  return <ComponentLabel {...rest} componentId={parsedId} />;
}
