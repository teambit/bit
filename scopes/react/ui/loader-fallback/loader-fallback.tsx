import React, { ComponentType, useRef, useEffect, useState } from 'react';
import { LoaderRibbon } from '@teambit/base-ui.loaders.loader-ribbon';

export type LoaderProps = {
  /** component to render */
  Target: ComponentType | undefined;
  /** component to render when target is missing, for a grace period, until rendering the default */
  Loader?: ComponentType;
  /** cool-down period (in ms) to show Loader, before showing the default */
  timeout?: number;
  /** component to render when Target is undefined */
  DefaultComponent: ComponentType;
};

export function LoaderFallback({ Target, Loader = LoaderComponent, DefaultComponent, timeout = 15000 }: LoaderProps) {
  const [ToRender, setRenderTarget] = useState<JSX.Element | null>(Target ? <Target /> : <DefaultComponent />);
  const prevValue = useRef<ComponentType | undefined>(undefined);

  // could re-implement with a state machine or a reducer
  useEffect(() => {
    const prev = prevValue.current;
    prevValue.current = Target;

    if (Target) {
      setRenderTarget(<Target />);
      return () => {};
    }
    // else -> Target === undefined

    // Target has changed from a value to undefined.
    // show loader and hope webpack will supply a component
    if (prev) {
      setRenderTarget(<Loader />);

      const tmId = setTimeout(() => setRenderTarget(<DefaultComponent />), timeout);
      return () => clearTimeout(tmId);
    }
    // else -> Target === undefined, prev === undefined

    // comp changed from undefined to undefined
    // could happen on first render, or when one of the other values change.

    return () => {}; // nothing to do here
  }, [Target, DefaultComponent, Loader, timeout]);

  return ToRender;
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
