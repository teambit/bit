import React, { useMemo } from 'react';
import { gql } from '@apollo/client';
import { useComponentCompare, InlineCompareEmpty } from '@teambit/component.ui.component-compare.context';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { useDiffMode } from '@teambit/component.ui.component-compare.component-compare';
import { DiffLoadingSkeleton } from '@teambit/code.ui.inline-diff-viewer';
import { DiffViewer, computeDiffLines, statsFromItems, type DiffViewMode } from '@teambit/code.ui.diff-viewer';

// `grid-template-columns: minmax(0, 1fr)` hard-constrains every aspect row to the pane width: a grid
// item in a `minmax(0, ...)` track cannot be widened by its (wide) content, so a long JSON line can
// only scroll/wrap inside the diff body — it can never push the row, pane, or page horizontally wider.
// Same fix the code view uses to stop the config diff overflowing.
const GRID_WRAP: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)' };
const CELL_WRAP: React.CSSProperties = { minWidth: 0 };

const GET_COMPONENT_ASPECTS = gql`
  query GetComponentAspectData($id: String!) {
    getHost {
      id
      get(id: $id) {
        id {
          name
          version
          scope
        }
        aspects {
          id
          config
          data
          icon
        }
      }
    }
  }
`;

type AspectData = {
  id: string;
  config: any;
  data: any;
  icon?: string;
};

type AspectDiff = {
  aspectId: string;
  configChanged: boolean;
  baseConfig: string;
  compareConfig: string;
  dataChanged: boolean;
  baseData: string;
  compareData: string;
};

export function InlineConfigCompare() {
  const diffMode = useDiffMode();
  const view: DiffViewMode = diffMode === 'unified' ? 'unified' : 'split';
  const componentCompare = useComponentCompare();

  const baseModel = componentCompare?.base?.model;
  const compareModel = componentCompare?.compare?.model;
  const baseId = baseModel?.id?.toString();
  const compareId = compareModel?.id?.toString();

  const { data: baseData, loading: baseLoading } = useDataQuery(GET_COMPONENT_ASPECTS, {
    variables: { id: baseId },
    skip: !baseId,
    fetchPolicy: 'no-cache',
  });

  const { data: compareData, loading: compareLoading } = useDataQuery(GET_COMPONENT_ASPECTS, {
    variables: { id: compareId },
    skip: !compareId,
    fetchPolicy: 'no-cache',
  });

  const loading = baseLoading || compareLoading || componentCompare?.loading;

  const baseAspects: AspectData[] = baseData?.getHost?.get?.aspects || [];
  const compareAspects: AspectData[] = compareData?.getHost?.get?.aspects || [];

  const componentIdStr = (compareModel?.id || baseModel?.id)?.toStringWithoutVersion?.() || '';

  const aspectDiffs = useMemo(() => {
    if (loading) return [];

    const baseMap = new Map<string, AspectData>();
    baseAspects.forEach((a) => baseMap.set(a.id, a));

    const compareMap = new Map<string, AspectData>();
    compareAspects.forEach((a) => compareMap.set(a.id, a));

    const allIds = new Set([...baseMap.keys(), ...compareMap.keys()]);
    const diffs: AspectDiff[] = [];

    for (const aspectId of allIds) {
      const baseAspect = baseMap.get(aspectId);
      const compareAspect = compareMap.get(aspectId);

      const baseConfig = ensureTrailingNewline(JSON.stringify(baseAspect?.config ?? null, null, 2));
      const compareConfig = ensureTrailingNewline(JSON.stringify(compareAspect?.config ?? null, null, 2));
      const baseDataStr = ensureTrailingNewline(JSON.stringify(baseAspect?.data ?? null, null, 2));
      const compareDataStr = ensureTrailingNewline(JSON.stringify(compareAspect?.data ?? null, null, 2));

      // a real diff = at least one changed line. compare rendered content directly, then confirm via the
      // same line-diff the viewer uses so a whitespace-only reformat doesn't surface as an empty section.
      const configChanged =
        baseConfig !== compareConfig && statsHaveChanges(computeDiffLines(baseConfig, compareConfig));
      const dataChanged =
        baseDataStr !== compareDataStr && statsHaveChanges(computeDiffLines(baseDataStr, compareDataStr));

      if (!configChanged && !dataChanged) continue;

      diffs.push({
        aspectId,
        configChanged,
        baseConfig,
        compareConfig,
        dataChanged,
        baseData: baseDataStr,
        compareData: compareDataStr,
      });
    }

    return diffs;
    // key on the stable Apollo data refs — baseAspects/compareAspects are re-derived (`|| []`) every render
  }, [loading, baseData, compareData]);

  if (loading) {
    return <DiffLoadingSkeleton sections={2} />;
  }

  if (aspectDiffs.length === 0) {
    return <InlineCompareEmpty message="No configuration changes" />;
  }

  // GRID_WRAP (minmax(0,1fr)) constrains each aspect row to the pane width so a long JSON line can only
  // scroll/wrap inside the diff body — never widening the row, pane, or page (the overflow the old
  // renderer had). `wrap` + `virtualize={false}` = the same soft-wrap, full-render mode as the code view.
  return (
    <div style={GRID_WRAP}>
      {aspectDiffs.map((aspect) => {
        const shortName = aspect.aspectId.split('/').pop() || aspect.aspectId;
        return (
          <div
            key={aspect.aspectId}
            data-file-id={componentIdStr ? `${componentIdStr}:${shortName}` : undefined}
            style={CELL_WRAP}
          >
            {aspect.configChanged && (
              <DiffViewer
                fileName={`${shortName} — config`}
                oldContent={aspect.baseConfig}
                newContent={aspect.compareConfig}
                language="json"
                status="modified"
                view={view}
                showViewToggle={false}
                virtualize={false}
                wrap
              />
            )}
            {aspect.dataChanged && (
              <DiffViewer
                fileName={`${shortName} — data`}
                oldContent={aspect.baseData}
                newContent={aspect.compareData}
                language="json"
                status="modified"
                view={view}
                showViewToggle={false}
                virtualize={false}
                wrap
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** true when a computed line-diff contains at least one added or removed line. */
function statsHaveChanges(items: ReturnType<typeof computeDiffLines>): boolean {
  const stats = statsFromItems(items);
  return stats.additions > 0 || stats.deletions > 0;
}

function ensureTrailingNewline(s: string): string {
  return s.endsWith('\n') ? s : s + '\n';
}
