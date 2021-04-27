import React, { ReactNode } from 'react';
import { useSingleton, UseSingletonProps } from '@tippyjs/react';
import { ProvideTooltipInstance } from './shared-instance';
import { Tooltip, TooltipProps } from './tooltip';

export interface SingletonTooltipProviderProps extends Omit<TooltipProps & UseSingletonProps, 'children'> {
  children: ReactNode;
  //  topic?: string;
}

/**
 * create a Popper instance that will be shared with all children tooltip elements, using Tippy's `useSingleton()` hook.
 * Any props will be passed to the Tippy element, which will be rendered beside the children.
 *
 * For more control, use the `Tooltip`, `ProvideTooltipInstance`, components with the `useSingleton` hook directly.
 */
export function SingletonTooltipProvider({ children, disabled, overrides, ...rest }: SingletonTooltipProviderProps) {
  const [tooltipSource, tooltipTarget] = useSingleton({ disabled, overrides });

  return (
    <>
      <Tooltip {...rest} singleton={tooltipSource} />
      <ProvideTooltipInstance value={tooltipTarget}>{children}</ProvideTooltipInstance>
    </>
  );
}
