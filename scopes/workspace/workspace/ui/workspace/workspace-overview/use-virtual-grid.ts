import { useMemo, useState, useEffect, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
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

// Suppress the benign "ResizeObserver loop completed with undelivered notifications" error.
// This fires when measureElement triggers layout changes within the same frame — expected
// behavior with virtual scrolling. Browsers treat it as a warning, not a real error.
if (typeof window !== 'undefined') {
  const origOnError = window.onerror;
  window.onerror = (msg, ...args) => {
    if (typeof msg === 'string' && msg.includes('ResizeObserver loop')) return true;
    return origOnError ? (origOnError as Function)(msg, ...args) : false;
  };
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

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;

    const update = () => {
      const width = el.clientWidth;
      // Account for container padding (5% each side)
      const padded = width * 0.9;
      setColumns(calcColumns(padded));
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef]);

  const virtualRows = useMemo(() => buildVirtualRows(groups, groupType, columns), [groups, groupType, columns]);

  const HEADER_HEIGHT = 48;
  const CARD_ROW_HEIGHT = isMinimal ? 500 : 320;

  const estimateSize = useCallback(
    (index: number) => {
      const row = virtualRows[index];
      if (!row) return CARD_ROW_HEIGHT;
      return row.type === 'header' ? HEADER_HEIGHT : CARD_ROW_HEIGHT;
    },
    [virtualRows, HEADER_HEIGHT, CARD_ROW_HEIGHT]
  );

  const virtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    overscan: 5,
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  return { virtualizer, virtualRows, columns };
}
