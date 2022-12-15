import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { gql } from '@apollo/client';
import { LaneId } from '@teambit/lane-id';
import { ComponentID, ComponentIdObj } from '@teambit/component-id';
import { LaneDiff, PlainLaneDiff, ChangeType } from '@teambit/dot-lanes.entities.lane-diff';

export type LaneDiffStatusQueryResponse = {
  lanes: {
    diffStatus: {
      source: { name: string; scope: string };
      target: { name: string; scope: string };
      upToDate: boolean;
      componentsStatus: Array<{
        componentId: ComponentIdObj;
        changeType: ChangeType;
        upToDate: boolean;
      }>;
    };
  };
};

export const QUERY_LANE_DIFF_STATUS = gql`
  query LaneDiffStatus($source: String!, $target: String!) {
    lanes {
      diffStatus(source: $source, target: $target) {
        source {
          name
          scope
        }
        target {
          name
          scope
        }
        upToDate
        componentsStatus {
          componentId {
            scope
            name
            version
          }
          changeType
          upToDate
        }
      }
    }
  }
`;

export type UseLaneDiffStatusResult = { loading?: boolean; laneDiff?: LaneDiff };
export function useLaneDiffStatus(baseId?: string, compareId?: string): UseLaneDiffStatusResult {
  const { data, loading } = useDataQuery<LaneDiffStatusQueryResponse>(QUERY_LANE_DIFF_STATUS, {
    variables: {
      target: baseId,
      source: compareId,
    },
    skip: !baseId || !compareId,
  });

  const plainLaneDiff: PlainLaneDiff | undefined = data?.lanes.diffStatus && {
    sourceLane: LaneId.from(data.lanes.diffStatus.source.name, data.lanes.diffStatus.source.scope).toString(),
    targetLane: LaneId.from(data.lanes.diffStatus.target.name, data.lanes.diffStatus.target.scope).toString(),
    diff: data.lanes.diffStatus.componentsStatus.map((c) => ({
      ...c,
      componentId: ComponentID.fromObject(c.componentId).toString(),
    })),
  };

  const laneDiff = plainLaneDiff && LaneDiff.from(plainLaneDiff);

  return {
    loading,
    laneDiff,
  };
}
