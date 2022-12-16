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
  query LaneDiffStatus($source: String!, $target: String!, $options: DiffStatusOptions) {
    lanes {
      diffStatus(source: $source, target: $target, options: $options) {
        source {
          name
          scope
        }
        target {
          name
          scope
        }
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
  const { data, loading } = useDataQuery<LaneDiffStatusQueryResponse>(QUERY_LANE_DIFF_STATUS, {
    variables: {
      target: baseId,
      source: compareId,
      options,
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
};
