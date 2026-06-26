import { gql, useQuery } from '@apollo/client';
import { LaneId } from '@teambit/lane-id';
import { ComponentID, type ComponentIdObj } from '@teambit/component-id';
import { LaneDiff, type PlainLaneDiff, type ChangeType } from '@teambit/lanes.entities.lane-diff';

export type LaneDiffStatusQueryResponse = {
  lanes: {
    diffStatus: {
      source: { name: string; scope: string };
      target: { name: string; scope: string };
      upToDate: boolean;
      componentsStatus: Array<{
        componentId: ComponentIdObj;
        changes: ChangeType[];
        upToDate: boolean;
        sourceHead: string;
        targetHead?: string;
        baseSource?: 'workspace' | 'scope';
      }>;
    };
  };
};

export const QUERY_LANE_DIFF_STATUS = gql`
  query LaneDiffStatus($source: String!, $target: String!, $options: DiffStatusOptions) {
    lanes {
      id
      diffStatus(source: $source, target: $target, options: $options) {
        id
        source {
          name
          scope
        }
        target {
          name
          scope
        }
        componentsStatus {
          id
          componentId {
            scope
            name
            version
          }
          sourceHead
          targetHead
          baseSource
          changes
          upToDate
          unrelated
        }
      }
    }
  }
`;

export type UseLaneDiffStatusResult = { loading?: boolean; laneDiff?: LaneDiff };
export type UseLaneDiffStatus = (props: UseLaneDiffStatusProps) => UseLaneDiffStatusResult;
export type UseLaneDiffStatusOptions = {
  skipChanges?: boolean;
  skipUpToDate?: boolean;
};

export type UseLaneDiffStatusProps = {
  baseId?: string;
  compareId?: string;
  options?: UseLaneDiffStatusOptions;
};

export const useLaneDiffStatus: UseLaneDiffStatus = ({ baseId, compareId, options }) => {
  // opt the lane-diff query into the GraphQL batching transport. when other batched queries fire in the
  // same tick (e.g. the lane menu's lane-list + lane-status queries), they coalesce into a single HTTP
  // round trip. solo, this still goes through BatchHttpLink and incurs only the `batchInterval` delay.
  const { data, loading } = useQuery<LaneDiffStatusQueryResponse>(QUERY_LANE_DIFF_STATUS, {
    variables: {
      source: compareId,
      target: baseId,
      options,
    },
    skip: !baseId || !compareId,
    context: { batch: true },
  });

  const plainLaneDiff: PlainLaneDiff | undefined = data?.lanes.diffStatus && {
    sourceLane: LaneId.from(data.lanes.diffStatus.source.name, data.lanes.diffStatus.source.scope).toString(),
    targetLane: LaneId.from(data.lanes.diffStatus.target.name, data.lanes.diffStatus.target.scope).toString(),
    diff: data.lanes.diffStatus.componentsStatus.map((c) => ({
      ...c,
      changes: c.changes || [],
      componentId: ComponentID.fromObject(c.componentId).toString(),
    })),
  };

  const laneDiff = plainLaneDiff && LaneDiff.from(plainLaneDiff);

  return {
    loading,
    laneDiff,
  };
};
