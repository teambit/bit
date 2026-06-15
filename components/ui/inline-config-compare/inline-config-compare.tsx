import React, { useMemo } from 'react';
import { gql } from '@apollo/client';
import { useComponentCompare, InlineCompareEmpty } from '@teambit/component.ui.component-compare.context';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { useDiffMode } from '@teambit/component.ui.component-compare.component-compare';
import {
  DiffFileRenderer,
  DiffLoadingSkeleton,
  computeDiffFromContent,
  type DiffHunk,
  type DiffDisplayMode,
} from '@teambit/code.ui.inline-diff-viewer';

export type InlineConfigCompareProps = {
  diffMode?: DiffDisplayMode;
};

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
  configHunks: DiffHunk[];
  configAdditions: number;
  configDeletions: number;
  dataHunks: DiffHunk[];
  dataAdditions: number;
  dataDeletions: number;
};

export function InlineConfigCompare({ diffMode: diffModeProp }: InlineConfigCompareProps) {
  const contextDiffMode = useDiffMode();
  const diffMode = diffModeProp || contextDiffMode;
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

      const configChanged = baseConfig !== compareConfig;
      const dataChanged = baseDataStr !== compareDataStr;

      if (!configChanged && !dataChanged) continue;

      const configHunks = configChanged ? computeDiffFromContent(baseConfig, compareConfig) : [];
      const dataHunks = dataChanged ? computeDiffFromContent(baseDataStr, compareDataStr) : [];

      diffs.push({
        aspectId,
        configHunks,
        configAdditions: configHunks.reduce((s, h) => s + h.lines.filter((l) => l.type === 'added').length, 0),
        configDeletions: configHunks.reduce((s, h) => s + h.lines.filter((l) => l.type === 'removed').length, 0),
        dataHunks,
        dataAdditions: dataHunks.reduce((s, h) => s + h.lines.filter((l) => l.type === 'added').length, 0),
        dataDeletions: dataHunks.reduce((s, h) => s + h.lines.filter((l) => l.type === 'removed').length, 0),
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

  return (
    <div>
      {aspectDiffs.map((aspect) => {
        const shortName = aspect.aspectId.split('/').pop() || aspect.aspectId;
        return (
          <div key={aspect.aspectId} data-file-id={componentIdStr ? `${componentIdStr}:${shortName}` : undefined}>
            {aspect.configHunks.length > 0 && (
              <DiffFileRenderer
                fileName={`${shortName} — config`}
                hunks={aspect.configHunks}
                status="MODIFIED"
                diffMode={diffMode}
                additions={aspect.configAdditions}
                deletions={aspect.configDeletions}
              />
            )}
            {aspect.dataHunks.length > 0 && (
              <DiffFileRenderer
                fileName={`${shortName} — data`}
                hunks={aspect.dataHunks}
                status="MODIFIED"
                diffMode={diffMode}
                additions={aspect.dataAdditions}
                deletions={aspect.dataDeletions}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ensureTrailingNewline(s: string): string {
  return s.endsWith('\n') ? s : s + '\n';
}
