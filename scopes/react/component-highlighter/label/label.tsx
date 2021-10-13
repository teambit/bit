import React, { useMemo, useState } from 'react';
import { usePopper } from 'react-popper';
import { ComponentID } from '@teambit/component-id';
import type { CardProps } from '@teambit/base-ui.surfaces.card';
import useAnimationFrame from 'use-animation-frame';
import type { Placement, Modifier } from '@popperjs/core';
import '@popperjs/core';

import { DefaultLabel } from './default-label';
import { ComponentLabel } from './component-label';

export interface LabelContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  targetRef: HTMLElement | null;
  offset?: [number, number];
  placement?: Placement;
  flip?: boolean;
}

export type { Placement };

// TODO - replace this with TippyJS, when it supports a `targetElement={targetRef.current}` prop
export function LabelContainer({ targetRef, offset, placement, flip = true, className, ...rest }: LabelContainerProps) {
  const [sourceRef, setSourceRef] = useState<HTMLDivElement | null>(null);

  const modifiers = useMemo<Partial<Modifier<any, any>>[]>(
    () => [{ name: 'offset', options: { offset } }],
    [flip, offset]
  );

  const { styles, attributes, update } = usePopper(targetRef, sourceRef, {
    modifiers,
    placement,
  });

  useAnimationFrame(() => update?.(), [update]);

  if (!targetRef) return null;

  return (
    <div
      {...rest}
      ref={setSourceRef}
      className={className}
      style={styles.popper}
      {...attributes.popper}
    />
  );
}

export interface LabelProps extends CardProps {
  componentId: string;
  link?: string;
  scopeLink?: string;
  local?: boolean;
}

export function Label({ componentId, link, scopeLink, local, ...rest }: LabelProps) {
  const parsedId = useMemo(() => ComponentID.tryFromString(componentId), [componentId]);

  if (!parsedId)
    return (
      <DefaultLabel {...rest} href={link}>
        {componentId}
      </DefaultLabel>
    );

  return <ComponentLabel {...rest} local={local} componentId={parsedId} link={link} scopeLink={scopeLink} />;
}
