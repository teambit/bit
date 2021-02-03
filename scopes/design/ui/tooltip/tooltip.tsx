import React from 'react';
import Tippy, { TippyProps } from '@tippyjs/react';
import { roundArrow } from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import 'tippy.js/dist/svg-arrow.css';

import './tooltip.scss';
import { useCtxTooltipInstance } from './shared-instance';

const THEME = 'teambit';

export interface TooltipProps extends TippyProps {
  id?: string;
}

export function Tooltip(props: TooltipProps) {
  const ctxInstance = useCtxTooltipInstance();

  const singleton = props.singleton || ctxInstance;
  console.log(props.id, 'singleton', singleton);

  return <Tippy arrow={roundArrow} theme={THEME} interactive {...props} singleton={singleton} />;
}
