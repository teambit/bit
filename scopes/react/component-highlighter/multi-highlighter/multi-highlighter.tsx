import React, { useEffect, useState, createRef, useRef, RefObject, useMemo } from 'react';
import classNames from 'classnames';
import getXPath from 'get-xpath';
import { v4 } from 'uuid';
import { domToReact, toRootElement } from '@teambit/react.modules.dom-to-react';
import {
  hasComponentMeta,
  componentMetaField,
  componentMetaProperties,
} from '@teambit/react.ui.highlighter.component-metadata.bit-component-meta';
import { ElementHighlighter, ElementHighlighterProps, HighlightTarget } from '../element-highlighter';
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
  highlighterOptions?: Omit<ElementHighlighterProps, 'target'>;
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

  useMultiHighlighter({ onChange: setTargets, scopeRef: ref, disabled, scopeClass: scopeClass.current });

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
    <div ref={ref} {...rest} className={classNames(scopeClass.current, rest.className)} style={_styles}>
      {children}
      {Object.entries(targets).map(([key, target]) => (
        <ElementHighlighter key={key} target={target} watchMotion={watchMotion} {...highlighterOptions} />
      ))}
    </div>
  );
}

type useMultiHighlighterProps = {
  onChange: (highlighterTargets: Record<string, HighlightTarget>) => void;
  disabled?: boolean;
  scopeRef: RefObject<HTMLElement>;
  scopeClass?: string;
};

export function useMultiHighlighter({
  onChange,
  disabled,
  scopeRef,
  scopeClass: scopeSelector = '',
}: useMultiHighlighterProps) {
  useEffect(() => {
    const nextTargets: Record<string, HighlightTarget> = {};
    const scopeElement = scopeRef.current;
    if (!scopeElement || disabled) return;

    // select all elements (except excluded)
    const allElements = Array.from(scopeElement.querySelectorAll<HTMLElement>(targetsSelector(`.${scopeSelector}`)));
    // seek the root element:
    const rootElements = allElements.map(toRootElement).filter((x) => !!x);
    // deduplicate
    const uniqueRoots = new Set(rootElements);

    uniqueRoots.forEach((element) => {
      const comp = domToReact(element);
      if (!element || !hasComponentMeta(comp)) return;

      const key = getXPath(element);
      const meta = comp[componentMetaField];
      const compId = meta[componentMetaProperties.componentId];
      const link = meta[componentMetaProperties.homepageUrl];
      const local = meta[componentMetaProperties.isExported] === false;
      nextTargets[key] = { element, id: compId, link, local };
    });

    onChange(nextTargets);
  }, [disabled, scopeSelector]);
}
