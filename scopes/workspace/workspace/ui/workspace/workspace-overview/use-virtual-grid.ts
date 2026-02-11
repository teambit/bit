import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import * as ReactVirtual from '@tanstack/react-virtual';
import type { AggregationGroup, AggregationType, WorkspaceItem } from './workspace-overview.types';

export type VirtualRowHeader = { type: 'header'; group: AggregationGroup; isFirst: boolean };
export type VirtualRowCards = { type: 'cards'; items: WorkspaceItem[] };
export type VirtualRow = VirtualRowHeader | VirtualRowCards;

const COL_GAP = 24;
const MIN_COL_WIDTH = 270;
const MAX_GRID_WIDTH = 1280;

function calcColumns(containerWidth: number): number {
  const effective = Math.min(containerWidth, MAX_GRID_WIDTH);
  return Math.max(1, Math.floor((effective + COL_GAP) / (MIN_COL_WIDTH + COL_GAP)));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function buildVirtualRows(groups: AggregationGroup[], groupType: AggregationType, columns: number): VirtualRow[] {
  const rows: VirtualRow[] = [];
  groups.forEach((group, groupIndex) => {
    if (groupType !== 'none') {
      rows.push({ type: 'header', group, isFirst: groupIndex === 0 });
    }
    const chunks = chunk(group.items, columns);
    for (const items of chunks) {
      rows.push({ type: 'cards', items });
    }
  });
  return rows;
}

export function useVirtualGrid({
  groups,
  groupType,
  scrollRef,
  isMinimal,
}: {
  groups: AggregationGroup[];
  groupType: AggregationType;
  scrollRef: React.RefObject<HTMLDivElement>;
  isMinimal: boolean;
}) {
  const [columns, setColumns] = useState(4);
  const resizeRafRef = useRef<number | undefined>(undefined);

  // Runtime compatibility shim:
  // some loaded bundles expose legacy `useVirtual` instead of `useVirtualizer`.
  const useVirtualizerCompat =
    typeof (ReactVirtual as any).useVirtualizer === 'function'
      ? ((ReactVirtual as any).useVirtualizer as
          | ((opts: {
              count: number;
              getScrollElement: () => HTMLElement | null;
              estimateSize: (index: number) => number;
              overscan: number;
              measureElement?: (el: Element) => number;
            }) => {
              getTotalSize: () => number;
              getVirtualItems: () => Array<{ key: string | number; index: number; start: number }>;
              measureElement?: (el: Element) => void;
            })
          | undefined)
      : undefined;
  const useVirtualCompat =
    typeof (ReactVirtual as any).useVirtual === 'function'
      ? ((ReactVirtual as any).useVirtual as
          | ((opts: {
              size: number;
              parentRef: React.RefObject<HTMLElement>;
              estimateSize: (index: number) => number;
              overscan?: number;
            }) => {
              totalSize: number;
              virtualItems: Array<{ key?: string | number; index: number; start: number }>;
              measureRef?: (el: Element | null) => void;
            })
          | undefined)
      : undefined;
  const shouldUseModernVirtualizer = !!useVirtualizerCompat;
  const shouldUseLegacyVirtualizer = !shouldUseModernVirtualizer && !!useVirtualCompat;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;

    const update = () => {
      const width = el.clientWidth;
      // Account for container padding (5% each side)
      const padded = width * 0.9;
      const nextColumns = calcColumns(padded);
      setColumns((prev) => (prev === nextColumns ? prev : nextColumns));
    };

    const scheduleUpdate = () => {
      if (resizeRafRef.current) {
        window.cancelAnimationFrame(resizeRafRef.current);
      }
      resizeRafRef.current = window.requestAnimationFrame(() => {
        resizeRafRef.current = undefined;
        update();
      });
    };

    update();

    const ro = new ResizeObserver(scheduleUpdate);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (resizeRafRef.current) {
        window.cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = undefined;
      }
    };
  }, [scrollRef]);

  const virtualRows = useMemo(() => buildVirtualRows(groups, groupType, columns), [groups, groupType, columns]);

  const HEADER_HEIGHT = 52;
  const CARD_ROW_HEIGHT = isMinimal ? 328 : 304;

  const estimateSize = useCallback(
    (index: number) => {
      const row = virtualRows[index];
      if (!row) return CARD_ROW_HEIGHT;
      return row.type === 'header' ? HEADER_HEIGHT : CARD_ROW_HEIGHT;
    },
    [virtualRows, HEADER_HEIGHT, CARD_ROW_HEIGHT]
  );

  const fallbackOffsets = useMemo(() => {
    const starts: number[] = [];
    let total = 0;
    for (let i = 0; i < virtualRows.length; i += 1) {
      starts[i] = total;
      total += estimateSize(i);
    }
    return { starts, total };
  }, [virtualRows, estimateSize]);

  const legacyVirtualizer = shouldUseLegacyVirtualizer
    ? useVirtualCompat({
        size: virtualRows.length,
        parentRef: scrollRef as unknown as React.RefObject<HTMLElement>,
        estimateSize,
        overscan: 5,
      })
    : undefined;

  const virtualizer = shouldUseModernVirtualizer
    ? useVirtualizerCompat({
        count: virtualRows.length,
        getScrollElement: () => scrollRef.current,
        estimateSize,
        overscan: 5,
      })
    : legacyVirtualizer
      ? {
          getTotalSize: () => legacyVirtualizer.totalSize,
          getVirtualItems: () =>
            legacyVirtualizer.virtualItems.map((item) => ({
              key: item.key ?? item.index,
              index: item.index,
              start: item.start,
            })),
          measureElement: (el: Element) => legacyVirtualizer.measureRef?.(el),
        }
      : {
          getTotalSize: () => fallbackOffsets.total,
          getVirtualItems: () =>
            virtualRows.map((_, index) => ({
              key: index,
              index,
              start: fallbackOffsets.starts[index] || 0,
            })),
          measureElement: () => undefined,
        };

  const isVirtualized = shouldUseModernVirtualizer || shouldUseLegacyVirtualizer;

  return { virtualizer, virtualRows, columns, isVirtualized, rowStarts: fallbackOffsets.starts };
}
