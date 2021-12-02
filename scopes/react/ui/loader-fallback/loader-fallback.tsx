import React, { ComponentType, useEffect, useState, ReactElement } from 'react';
import { LoaderRibbon } from '@teambit/base-ui.loaders.loader-ribbon';

export type LoaderProps = {
  /** component to render */
  Target: ComponentType | undefined;
  /** component to render when Target is undefined */
  DefaultComponent: ComponentType;
  /** component to render when target is missing, for a grace period, until rendering the default */
  Loader?: ComponentType;
  /** cool-down period (in ms) to show Loader, before showing the default */
  timeout?: number;
};

export function LoaderFallback({ Target, Loader = LoaderComponent, DefaultComponent, timeout = 15000 }: LoaderProps) {
  return useFallback(Target && <Target />, <DefaultComponent />, { timeout, loader: <Loader /> });
}

export type useFallbackOptions = { timeout?: number; loader?: ReactElement };

export function useFallback(
  target: ReactElement | null | undefined,
  fallback: ReactElement,
  { timeout = 15000, loader = <LoaderComponent /> }: useFallbackOptions = {}
): ReactElement | null {
  const [working, setWorking] = useState(!!target);
  const hasTarget = !!target;

  useEffect(() => {
    if (timeout <= 0) return () => {};
    if (hasTarget) {
      setWorking(true);
      return () => {};
    }

    const tmId = setTimeout(() => setWorking(false), timeout);
    return () => clearTimeout(tmId);
  }, [hasTarget, timeout]);

  if (target) return target;
  if (working && timeout > 0) return loader;
  return fallback;
}

/*
 * TIP:
 * useState() and setState() can receive a function as value.
 * So, be careful when using a react Function Component, like:
 * ```
 * useState(ButtonComponent) // will try to run ButtonComponent as a function
 * setState(ButtonComponent)
 *
 * // instead, do:
 * useState(() => ButtonComponent)
 * setState(() => ButtonComponent)
 * ```
 *
 * or don't set components as state to begin with.
 */

function LoaderComponent() {
  return <LoaderRibbon active style={{ position: 'fixed', top: 0, left: 0, right: 0 }} />;
}
