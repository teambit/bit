import React, { useState, useEffect, CSSProperties, useRef, createRef } from 'react';
import classnames from 'classnames';
import { v4 } from 'uuid';

import { useHoverHighlighter } from '../component-highlighter/hover-highlighter';
import { ElementHighlighter, HighlightTarget, Placement, HighlightClasses } from '../element-highlighter';
import { useMultiHighlighter } from '../multi-highlighter/multi-highlighter';

export interface HybridHighlighterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** default pop location for the label */
  placement?: Placement;
  /** customize styles */
  classes?: HighlightClasses;
  /** customize highlighter */
  highlightStyle?: CSSProperties;
  /** debounces element hover selection.
   * A higher value will reduce element lookups as well as "keep" the highlight on the current element for longer.
   * Initial selection (when no element is currently selected) will always happen immediately to improve the user experience.
   * @default 80ms
   */
  debounceSelection?: number;
  /** continually update frame position to match moving elements */
  watchMotion?: boolean;

  /** set the behavior of the highlighter.
   * `disabled` - stops highlighting.
   * `allChildren` - highlights all components rendered under children
   * `hover` - highlighters the component immediately under the mouse cursor
   * */
  mode: 'disabled' | 'allChildren' | 'hover';
}

/** automatically highlight components on hover */
export function HybridHighlighter({
  children,
  classes,
  highlightStyle,
  placement,
  debounceSelection = 80,
  watchMotion = true,
  className,
  mode = 'hover',
  ...rest
}: HybridHighlighterProps) {
  const ref = createRef<HTMLDivElement>();
  const [targets, setTarget] = useState<Record<string, HighlightTarget>>({});
  const scopeClass = useRef(`hl-scope-${v4()}`).current;
  const hasTargets = Object.entries(targets).length > 0;

  // clear targets when disabled
  useEffect(() => {
    if (mode === 'disabled') setTarget({});
  }, [mode]);

  const handlers = useHoverHighlighter(
    (nextTarget) => setTarget(nextTarget ? { 'hover-target': nextTarget } : {}),
    rest,
    {
      debounceDuration: hasTargets ? debounceSelection : 0,
      scopeClass,
      disabled: mode !== 'hover',
    }
  );

  useMultiHighlighter({
    onChange: setTarget,
    scopeRef: ref,
    disabled: mode !== 'allChildren',
    scopeClass,
  });

  return (
    <div
      ref={ref}
      {...rest}
      {...handlers}
      className={classnames(className, scopeClass)}
      data-nullify-component-highlight
    >
      {children}
      {/*
       * keep the highlighter inside of the hover selector, or it could disappear when switching between elements
       * the excludeHighlighterAtt will ensure it doesn't turn into a recursion.
       */}
      {Object.entries(targets).map(([key, target]) => (
        <ElementHighlighter
          key={key}
          target={target}
          classes={classes}
          style={highlightStyle}
          placement={placement}
          watchMotion={watchMotion}
        />
      ))}
    </div>
  );
}
