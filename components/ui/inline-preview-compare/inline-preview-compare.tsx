import React, { useState, useEffect, useRef } from 'react';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import { PreviewCompareRenderer } from '@teambit/preview.ui.preview-compare';
import { CompositionCompare } from '@teambit/compositions.ui.composition-compare';

export type InlinePreviewCompareProps = {
  /** Placeholder min-height */
  minHeight?: number;
};

/**
 * Lightweight preview compare for LaneCompare.
 * Reads base/compare from ComponentCompareContext,
 * renders CompositionCompare with browser skeleton placeholder.
 * No review/feedback/mask dependencies — just preview diffing.
 */
export function InlinePreviewCompare({ minHeight: _minHeight = 200 }: InlinePreviewCompareProps) {
  const componentCompare = useComponentCompare();
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  // Listen for iframe _DOM_LOADED_ from our container's iframes
  useEffect(() => {
    if (loaded) return;
    const container = containerRef.current;
    if (!container) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.event !== '_DOM_LOADED_') return;
      const iframes = container.querySelectorAll('iframe');
      for (const iframe of iframes) {
        try {
          if (iframe.contentWindow === event.source) {
            setTimeout(() => setLoaded(true), 500);
            return;
          }
        } catch {
          /* cross-origin */
        }
      }
    };
    window.addEventListener('message', handler);
    const fallback = setTimeout(() => setLoaded(true), 8000);
    return () => {
      window.removeEventListener('message', handler);
      clearTimeout(fallback);
    };
  }, [loaded]);

  const hasModels = componentCompare?.base?.model || componentCompare?.compare?.model;

  if (!componentCompare || !hasModels) {
    return <PreviewCompareRenderer loaded={false}>{null}</PreviewCompareRenderer>;
  }

  const hasCompositions =
    (componentCompare.base?.model?.compositions?.length || 0) > 0 ||
    (componentCompare.compare?.model?.compositions?.length || 0) > 0;

  if (!hasCompositions) {
    return null;
  }

  return (
    <div ref={containerRef}>
      <PreviewCompareRenderer loaded={loaded}>
        <CompositionCompare />
      </PreviewCompareRenderer>
    </div>
  );
}
