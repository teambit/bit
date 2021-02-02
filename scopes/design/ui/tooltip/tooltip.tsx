import React from 'react';
import Tippy, { TippyProps, UseSingletonProps } from '@tippyjs/react';
import { roundArrow } from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import 'tippy.js/dist/svg-arrow.css';

import './tooltip.scss';

const THEME = 'teambit';

export type TooltipProps = TippyProps;
export { UseSingletonProps };

export function Tooltip(props: TippyProps) {
  if (!props.children) return null;

  return <Tippy arrow={roundArrow} theme={THEME} interactive {...props} />;
}

export { useSingleton, tippy } from '@tippyjs/react';
