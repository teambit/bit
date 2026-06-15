import React, { useMemo } from 'react';
import { useComponentCompare } from '@teambit/component.ui.component-compare.context';
import { ComponentID } from '@teambit/component-id';
import { ComponentUrl } from '@teambit/component.modules.component-url';
import {
  DepsDiffTable,
  computeDepsDiff,
  type RawDep,
  type DepDiffEntry,
} from '@teambit/dependencies.ui.deps-diff-table';
import { DiffLoadingSkeleton } from '@teambit/code.ui.inline-diff-viewer';

export type InlineDepsCompareProps = {};

export function InlineDepsCompare(_props: InlineDepsCompareProps) {
  const componentCompare = useComponentCompare();

  const { entries, baseLabel, compareLabel } = useMemo(() => {
    const base = componentCompare?.base;
    const compare = componentCompare?.compare;
    if (!base?.descriptor || !compare?.descriptor) {
      return { entries: [], baseLabel: 'Base', compareLabel: 'Compare' };
    }

    const baseDepsAspect = base.descriptor.get<any>('teambit.dependencies/dependency-resolver');
    const compareDepsAspect = compare.descriptor.get<any>('teambit.dependencies/dependency-resolver');

    const baseDeps: RawDep[] = baseDepsAspect?.data?.dependencies || baseDepsAspect?.dependencies || [];
    const compareDeps: RawDep[] = compareDepsAspect?.data?.dependencies || compareDepsAspect?.dependencies || [];

    const shortenVersion = (v?: string) => (v?.includes('.') ? v : v?.substring(0, 6));

    const rawEntries = computeDepsDiff(baseDeps, compareDeps);

    const entriesWithUrls: DepDiffEntry[] = rawEntries.map((entry) => {
      if (entry.status !== 'modified' || !entry.isComponent || !entry.componentId) return entry;

      try {
        const compId = ComponentID.fromObject(entry.componentId);
        const url = ComponentUrl.toUrl(compId, { includeVersion: false, useLocationOrigin: true });
        const baseVersion = entry.baseComponentId?.version;
        const compareUrl = `${url}/~compare${compId.version ? `?version=${compId.version}` : ''}${baseVersion ? `&baseVersion=${baseVersion}` : ''}`;
        return { ...entry, compareUrl };
      } catch {
        return entry;
      }
    });

    return {
      entries: entriesWithUrls,
      baseLabel: shortenVersion(base.model.id.version) || 'Base',
      compareLabel: (compare as any).hasLocalChanges
        ? 'workspace'
        : shortenVersion(compare.model.id.version) || 'Compare',
    };
  }, [
    componentCompare?.base?.model?.id?.toString(),
    componentCompare?.compare?.model?.id?.toString(),
    (componentCompare?.compare as any)?.hasLocalChanges,
  ]);

  if (!componentCompare || componentCompare.loading) {
    return <DiffLoadingSkeleton />;
  }

  return <DepsDiffTable entries={entries} baseLabel={baseLabel} compareLabel={compareLabel} />;
}
