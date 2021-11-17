import React, { useEffect, useState, createRef } from 'react';
import getXPath from 'get-xpath';
import { ElementHighlighter, ElementHighlighterProps, HighlightTarget } from '@teambit/react.ui.component-highlighter';
import { domToReact, toRootElement } from '@teambit/react.modules.dom-to-react';
import { hasComponentMeta } from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';
import { excludeHighlighterSelector } from '../ignore-highlighter';

// TODO - reuse selector from @teambit/react.ui.component-highlighter
const allExceptHighlighterQuery = `:not(${excludeHighlighterSelector}, ${excludeHighlighterSelector} *)`;

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

  useEffect(() => {
    if (disabled) {
      setTargets({});
      return;
    }

    const { current } = ref;
    if (!current) return;

    // select all non-highlighter elements
    const allElements = Array.from(current.querySelectorAll<HTMLElement>(allExceptHighlighterQuery));

    // converge on the root element of components
    const rootElements = allElements.map(toRootElement).filter((x) => !!x);
    // deduplicate
    const uniqueRoots = new Set(rootElements);

    const nextTargets: Record<string, HighlightTarget> = {};
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
    <div ref={ref} {...rest} style={{ ...colors, ...style }}>
      {children}
      {Object.entries(targets).map(([key, target]) => (
        <ElementHighlighter key={key} target={target} watchMotion={watchMotion} {...highlighterOptions} />
      ))}
    </div>
  );
}
