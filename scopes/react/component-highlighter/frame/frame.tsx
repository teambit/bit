import React, { useState, useEffect } from 'react';
import { usePopper, Modifier } from 'react-popper';
import useAnimationFrame from 'use-animation-frame';
import classnames from 'classnames';
import '@popperjs/core';

import { ignorePopperSize } from '@teambit/base-ui.utils.popper-js.ignore-popper-size';
import { resizeToMatchReference } from '@teambit/base-ui.utils.popper-js.resize-to-match-reference';

import classStyles from './frame.module.scss';

const BASE_OFFSET = +classStyles.offset;

const popperModifiers: Modifier<any>[] = [
  ignorePopperSize,
  resizeToMatchReference,
  {
    name: 'flip',
    enabled: false,
  },
  {
    name: 'offset',
    options: {
      // move box from above the target ('top-start')
      // to directly cover the target.
      offset: ({ reference }: any) => [BASE_OFFSET, BASE_OFFSET - reference.height],
    },
  },
];

export interface FrameProps extends React.HTMLAttributes<HTMLDivElement> {
  targetRef: HTMLElement | null;
  stylesClass?: string;
  motionTracking?: boolean;
}

export function Frame({
  targetRef,
  motionTracking,
  className,
  stylesClass = classStyles.overlayBorder,
  style,
}: FrameProps) {
  const [referenceElement, setReferenceElement] = useState<HTMLDivElement | null>(null);

  const { styles, attributes, update } = usePopper(targetRef, referenceElement, {
    modifiers: popperModifiers,
    placement: 'top-start',
  });

  useEffect(() => {
    const triggerRefocus = update;
    if (!triggerRefocus || !motionTracking) return () => {};

    let animationFrameId = 0;
    const f = () => {
      triggerRefocus().catch(() => {});
      animationFrameId = window.requestAnimationFrame(f);
    };
    f();

    return () => {
      if (animationFrameId > -1) window.cancelAnimationFrame(animationFrameId);
    };
  }, [update, motionTracking]);

  useAnimationFrame(() => update?.(), [update]);

  if (!targetRef) return null;

  return (
    <div
      ref={setReferenceElement}
      className={classnames(className, stylesClass)}
      style={{ ...styles.popper, ...style }}
      {...attributes.popper}
    />
  );
}
