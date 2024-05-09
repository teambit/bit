import React, { ReactNode } from 'react';
import classnames from 'classnames';
import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
import { darkMode } from '@teambit/base-ui.theme.dark-theme';
import Tippy, { TippyProps } from '@tippyjs/react';
import { roundArrow } from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import 'tippy.js/dist/svg-arrow.css';

import { getMountPoint } from './mount-point';
import { useCtxTooltipInstance } from './shared-instance';
import './tippy.module.scss';

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
  children?: ReactNode;
  breakline?: boolean;
  visibleOnMobile?: boolean;
}

/**
 * TippyJS tooltip with Teambit styles
 */
export function Tooltip({ children, breakline, singleton, visibleOnMobile, className, ...rest }: TooltipProps) {
  const isMobile = useIsMobile();
  if (!visibleOnMobile && isMobile) return <>{children}</>;

  const ctxInstance = useCtxTooltipInstance();

  const singletonInstance = singleton || ctxInstance;

  // children should accept a ref
  const child: any = typeof children === 'string' ? <span>{children}</span> : children;

  return (
    <Tippy
      arrow={roundArrow}
      className={classnames(darkMode, breakline && 'tippy-breakLine', className)}
      theme={THEME}
      interactive
      appendTo={getMountPoint}
      popperOptions={popperOptions}
      {...rest}
      singleton={singletonInstance}
    >
      {child}
    </Tippy>
  );
}
