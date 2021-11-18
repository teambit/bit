import React, { useEffect, useState, createRef, useRef } from 'react';
import classNames from 'classnames';
import getXPath from 'get-xpath';
import { v4 } from 'uuid';
import { ElementHighlighter, ElementHighlighterProps, HighlightTarget } from '@teambit/react.ui.component-highlighter';
import { domToReact, toRootElement } from '@teambit/react.modules.dom-to-react';
import { hasComponentMeta } from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';
import { excludeHighlighterSelector } from '../ignore-highlighter';

const targetsSelector = (
  /**
   * the scope in which to consider the exclude selector.
   * The `:scope` modifier is appropriate, but is not supported in older browsers.
   */
  scopeSelector = ':scope'
) => `:not(${scopeSelector} ${excludeHighlighterSelector}, ${scopeSelector} ${excludeHighlighterSelector} *)`;

export interface MultiHighlighterProps extends React.HTMLAttributes<HTMLDivElement> {
  disabled?: boolean;
  // /** automatically update when children update. Use with caution, might be slow */
  // watchDom?: boolean;
  /**
   * continually update highlighter position to match dom elements as they move. Use with caution, might be slow
   * @default false
   */
  watchMotion?: boolean;

  bgColor?: string;
  bgColorHover?: string;
  bgColorActive?: string;
  highlighterOptions?: ElementHighlighterProps;
}

export function MultiHighlighter({
  children,
  disabled,
  watchMotion = false,
  style,
  bgColor,
  bgColorActive,
  bgColorHover,
  highlighterOptions,
  ...rest
}: MultiHighlighterProps) {
  const ref = createRef<HTMLDivElement>();
  const [targets, setTargets] = useState<Record<string, HighlightTarget>>({});
  const scopeClass = useRef(`hl-scope-${v4()}`);

  useEffect(() => {
    if (disabled) setTargets({});
  }, [disabled]);

  useEffect(() => {
    const nextTargets: Record<string, HighlightTarget> = {};
    const { current } = ref;
    if (!current || disabled) return;

    // select all non-highlighter elements
    const allElements = Array.from(current.querySelectorAll<HTMLElement>(targetsSelector(`.${scopeClass.current}`)));

    // converge on the root element of components
    const rootElements = allElements.map(toRootElement).filter((x) => !!x);
    // deduplicate
    const uniqueRoots = new Set(rootElements);

    uniqueRoots.forEach((element) => {
      const comp = domToReact(element);
      if (!element || !hasComponentMeta(comp)) return;

      const key = getXPath(element);
      // eslint-disable-next-line no-underscore-dangle
      nextTargets[key] = { element, id: comp.__bit_component.id };
    });

    setTargets(nextTargets);
  }, [disabled]);

  const colors = {
    '--bit-highlighter-color': bgColor,
    '--bit-highlighter-color-hover': bgColorHover,
    '--bit-highlighter-color-active': bgColorActive,
  };

  return (
    <div ref={ref} {...rest} className={classNames(scopeClass.current, rest.className)} style={{ ...colors, ...style }}>
      {children}
      {Object.entries(targets).map(([key, target]) => (
        <ElementHighlighter key={key} target={target} watchMotion={watchMotion} {...highlighterOptions} />
      ))}
    </div>
  );
}
