import type { ReactNode } from 'react';
import React from 'react';
import classnames from 'classnames';
import { useIsMobile } from '@teambit/ui-foundation.ui.hooks.use-is-mobile';
import { darkMode } from '@teambit/base-ui.theme.dark-theme';
import type { TippyProps } from '@tippyjs/react';
import Tippy from '@tippyjs/react';
import { roundArrow } from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import 'tippy.js/dist/svg-arrow.css';

import { getMountPoint } from './mount-point';
import { useCtxTooltipInstance } from './shared-instance';
import './tippy.module.scss';

const THEME = 'teambit';

const FORWARD_REF = Symbol.for('react.forward_ref');
const MEMO = Symbol.for('react.memo');

/**
 * Whether a node can receive the ref Tippy attaches to its single child to anchor the tooltip. Host
 * elements (`type` is a string), class components, and `forwardRef`/`memo(forwardRef)` components can;
 * a plain function component (e.g. `Icon`) cannot — passing one to Tippy triggers React's "Function
 * components cannot be given refs" warning and leaves the tooltip unanchored. Such children (and
 * strings / fragments / arrays) get wrapped in a `<span>` below so Tippy refs the span instead.
 */
function acceptsRef(node: ReactNode): boolean {
  if (!React.isValidElement(node)) return false;
  const type = node.type as any;
  if (typeof type === 'string') return true;
  if (type?.prototype?.isReactComponent) return true;
  if (type?.$$typeof === FORWARD_REF) return true;
  if (type?.$$typeof === MEMO) {
    const inner = type.type;
    return typeof inner === 'string' || inner?.$$typeof === FORWARD_REF || !!inner?.prototype?.isReactComponent;
  }
  return false;
}
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

  // Tippy attaches a ref to its single child; wrap anything that can't take one (strings, plain
  // function components like `Icon`, fragments/arrays) in a <span> so the ref lands on a real DOM node.
  const child: any = acceptsRef(children) ? children : <span>{children}</span>;

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
