import React, { useState, useEffect, useMemo, useRef, createRef, CSSProperties } from 'react';
import classnames from 'classnames';
import { v4 } from 'uuid';

import { ComponentMetaHolder } from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';

import { useHoverHighlighter } from '../hover-highlighter';
import { ElementHighlighter, Placement, HighlightClasses } from '../element-highlighter';
import { useChildrenHighlighter } from '../children-highlighter';
import type { MatchRule, ComponentMatchRule } from '../rule-matcher';

type HighlightTarget = { element: HTMLElement; components: ComponentMetaHolder[] };

export interface HybridHighlighterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** stop all highlighting and drop listeners */
  disabled?: boolean;
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

  /** filter highlighter targets by this query selector. (May be a more complex object in the future) */
  rule?: MatchRule;
  /** filter components to match this rule. Can be id, array of ids, or a function */
  componentRule?: ComponentMatchRule;

  /** set the behavior of the highlighter.
   * `disabled` - stops highlighting.
   * `allChildren` - highlights all components rendered under children
   * `hover` - highlighters the component immediately under the mouse cursor
   * */
  mode?: 'allChildren' | 'hover';
  bgColor?: string;
  bgColorHover?: string;
  bgColorActive?: string;
}

/** automatically highlight components on hover */
export function HybridHighlighter({
  disabled,
  mode = 'hover',
  debounceSelection = 80,
  watchMotion = true,
  placement,
  rule,
  componentRule,

  classes,
  highlightStyle,
  className,
  style,
  bgColor,
  bgColorHover,
  bgColorActive,
  children,
  ...rest
}: HybridHighlighterProps) {
  const ref = createRef<HTMLDivElement>();
  const [targets, setTarget] = useState<Record<string, HighlightTarget>>({});
  const scopeClass = useRef(`hl-scope-${v4()}`).current;
  const hasTargets = Object.entries(targets).length > 0;

  // clear targets when disabled
  useEffect(() => {
    if (disabled) setTarget({});
  }, [disabled]);

  const handlers = useHoverHighlighter(
    (nextTarget) => setTarget(nextTarget ? { 'hover-target': nextTarget } : {}),
    rest,
    {
      debounceDuration: hasTargets ? debounceSelection : 0,
      scopeClass,
      disabled: disabled || mode !== 'hover',
      rule,
      componentRule,
    }
  );

  useChildrenHighlighter({
    onChange: setTarget,
    scopeRef: ref,
    scopeClass,
    disabled: disabled || mode !== 'allChildren',
    rule,
    componentRule,
  });

  const _styles = useMemo(
    () => ({
      '--bit-highlighter-color': bgColor,
      '--bit-highlighter-color-hover': bgColorHover,
      '--bit-highlighter-color-active': bgColorActive,
      ...style,
    }),
    [bgColor, bgColorHover, bgColorActive, style]
  );

  return (
    <div
      ref={ref}
      {...rest}
      {...handlers}
      style={_styles}
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
          targetRef={{ current: target.element }}
          components={target.components}
          classes={classes}
          style={highlightStyle}
          placement={placement}
          watchMotion={watchMotion}
        />
      ))}
    </div>
  );
}
