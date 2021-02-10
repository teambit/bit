import React, { ReactElement } from 'react';
import classnames from 'classnames';
import { darkMode } from '@teambit/base-ui.theme.dark-theme';
import Tippy, { TippyProps } from '@tippyjs/react';
import { roundArrow } from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import 'tippy.js/dist/svg-arrow.css';

import { getMountPoint } from './mount-point';
import './tooltip.scss';
import { useCtxTooltipInstance } from './shared-instance';

const THEME = 'teambit';
const popperOptions = {
  modifiers: [
    {
      name: 'arrow',
      options: {
        // prevent svg arrow from 'breaking' because of border radius
        padding: 5,
      },
    },
  ],
};

export interface TooltipProps extends Omit<TippyProps, 'children'> {
  children?: ReactElement<any> | string;
}

/**
 * TippyJS tooltip with Teambit styles
 */
export function Tooltip({ children, singleton, className, ...rest }: TooltipProps) {
  const ctxInstance = useCtxTooltipInstance();

  const _singleton = singleton || ctxInstance;

  // children should accept a ref
  const child = typeof children === 'string' ? <span>{children}</span> : children;

  return (
    <Tippy
      arrow={roundArrow}
      className={classnames(darkMode, className)}
      theme={THEME}
      interactive
      appendTo={getMountPoint}
      popperOptions={popperOptions}
      {...rest}
      singleton={_singleton}
    >
      {child}
    </Tippy>
  );
}
