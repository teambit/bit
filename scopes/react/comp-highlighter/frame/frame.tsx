import React, { useState } from 'react';
import { usePopper, Modifier } from 'react-popper';
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
}

export function Frame({ targetRef }: FrameProps) {
  const [referenceElement, setReferenceElement] = useState<HTMLDivElement | null>(null);

  const { styles, attributes } = usePopper(targetRef, referenceElement, {
    modifiers: popperModifiers,
    placement: 'top-start',
  });

  if (!targetRef) return null;

  return (
    <div
      ref={setReferenceElement}
      className={classnames(classStyles.overlayBorder)}
      style={styles.popper}
      {...attributes.popper}
      data-ignore-component-highlight
    ></div>
  );
}
