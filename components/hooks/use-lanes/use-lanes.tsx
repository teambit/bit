import { useMemo, useCallback } from 'react';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';
import { LaneModel, LanesModel, LanesQuery } from '@teambit/lanes.ui.models.lanes-model';
import { gql } from '@apollo/client';
import { LaneId } from '@teambit/lane-id';
import { isEqual } from 'lodash';
import { LanesContextModel, useLanesContext } from './lanes-context';

const GET_LANES = gql`
  query Lanes(
    $extensionId: String
    $laneIds: [String!]
    $offset: Int
    $limit: Int
    $sort: LaneSort
    $search: String
    $viewedLaneId: [String!]
    $skipViewedLane: Boolean!
  ) {
    lanes {
      id
      viewedLane: list(ids: $viewedLaneId) @skip(if: $skipViewedLane) {
        id {
          name
          scope
        }
        hash
        createdAt
        createdBy {
          name
          email
          profileImage
        }
        readmeComponent {
          id {
            name
            scope
            version
          }
        }
        laneComponentIds {
          name
          scope
          version
        }
      }
      list(ids: $laneIds, offset: $offset, limit: $limit, sort: $sort, search: $search) {
        id {
          name
          scope
        }
        hash
        createdAt
        createdBy {
          name
          email
          profileImage
        }
        readmeComponent {
          id {
            name
            scope
            version
          }
        }
        laneComponentIds {
          name
          scope
          version
        }
      }
      current {
        id {
          name
          scope
        }
        createdAt
        createdBy {
          name
          email
          profileImage
        }
        laneComponentIds {
          name
          scope
          version
        }
      }
      default {
        id {
          name
          scope
        }
        createdAt
        createdBy {
          name
          email
          profileImage
        }
        laneComponentIds {
          name
          scope
          version
        }
      }
    }
    getHost(id: $extensionId) {
      id
    }
  }
`;

export type LaneSort = {
  by?: Exclude<keyof LaneModel, 'components' | 'readmeComponent'>;
  direction?: string;
};
export type UseLanesOptions = {
  ids?: string[];
  offset?: number;
  limit?: number;
  sort?: LaneSort;
  search?: string;
};

export type FetchMoreLanesResult = {
  lanesModel?: LanesModel;
  loading?: boolean;
  hasMore?: boolean;
  nextOffset?: number;
  currentLimit?: number;
};

export type SearchLanesResult = {
  lanesModel?: LanesModel;
  loading?: boolean;
};

export type FetchMoreLanes = (offset: number, limit: number, sort?: LaneSort) => Promise<FetchMoreLanesResult>;

export type SearchLanes = (search?: string, skip?: boolean) => SearchLanesResult;

export type UseLanesResult = UseRootLanesResult & {
  searchResult?: SearchLanesResult;
} & LanesContextModel;

export type UseRootLanesResult = {
  lanesModel?: LanesModel;
  loading?: boolean;
  fetchMoreLanes?: FetchMoreLanes;
  hasMore?: boolean;
  offset?: number;
  limit?: number;
};

export type UseLanes = (
  targetLanes?: LanesModel,
  skip?: boolean,
  options?: UseLanesOptions,
  useContext?: boolean,
  scope?: string
) => UseLanesResult;

type UseRootLanes = (
  viewedLaneId?: LaneId,
  skip?: boolean,
  options?: UseLanesOptions,
  scope?: string
) => UseRootLanesResult;

const useRootLanes: UseRootLanes = (viewedLaneId, skip, options = {}, scope) => {
  const { ids, offset, limit, sort } = options;

  // @ts-ignore
  const { data, fetchMore, loading } = useDataQuery<LanesQuery>(GET_LANES, {
    variables: {
      laneIds: ids,
      offset,
      limit,
      sort,
      skipViewedLane: !viewedLaneId || viewedLaneId.isDefault(),
      viewedLaneId: viewedLaneId ? [viewedLaneId?.toString()] : undefined,
    },
    skip,
    errorPolicy: 'all',
    fetchPolicy: 'cache-and-network',
  });

  const lanesModel = useMemo(() => {
    if (!loading && !!data) {
      const newLanesModel = LanesModel.from({ data, scope });
      return newLanesModel;
    }
    return undefined;
  }, [loading, data, viewedLaneId?.toString(), scope]);

  const hasMore = useMemo(() => {
    if (loading) return true;
    if (!limit) return false;
    if (ids?.length) return (data?.lanes?.list?.length ?? 0) === ids.length;
    return (data?.lanes?.list?.length ?? 0) >= limit;
  }, [loading, data]);

  const fetchMoreLanes: FetchMoreLanes = useCallback(
    async (newOffset, newLimit) => {
      if (hasMore) {
        try {
          const { data: moreData, networkStatus } = await fetchMore({
            variables: {
              offset: newOffset,
              limit: newLimit,
              laneIds: [],
              skipViewedLane: !viewedLaneId || viewedLaneId.isDefault(),
              viewedLaneId: viewedLaneId ? [viewedLaneId?.toString()] : undefined,
            },
          });
          // ===  NetworkStatus.fetchMore
          const loadingMore = networkStatus === 3;

          if (!loadingMore && moreData.lanes) {
            const newLanesModel = LanesModel.from({ data: moreData });
            return {
              lanesModel: newLanesModel,
              loading: loadingMore,
              hasMore: (moreData.lanes.list?.length ?? 0) >= newLimit,
              nextOffset: newOffset + newLimit,
            };
          }
          return {
            lanesModel,
            loading: loadingMore,
            nextOffset: newOffset,
            currentLimit: newLimit,
          };
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(err);
          return {};
        }
      }
      return {
        lanesModel,
        loading: false,
        hasMore: false,
        nextOffset: newOffset,
        currentLimit: newLimit,
      };
    },
    [hasMore, viewedLaneId?.toString(), lanesModel]
  );

  return {
    loading,
    lanesModel,
    fetchMoreLanes,
    hasMore,
    offset,
    limit,
  };
};

export const useSearchLanes: SearchLanes = (search, skip) => {
  // @ts-ignore
  const { data: searchData, loading: loadingSearch } = useDataQuery<LanesQuery>(GET_LANES, {
    variables: {
      search,
      skipViewedLane: true,
    },
    skip: skip || !search,
    errorPolicy: 'all',
    fetchPolicy: 'cache-and-network',
  });

  if (!search) {
    return {};
  }

  return {
    loading: loadingSearch,
    lanesModel:
      searchData &&
      LanesModel.from({ data: { lanes: { ...searchData.lanes, current: undefined, default: undefined } } }),
  };
};

export const useLanes: UseLanes = (targetLanes, skip, optionsFromProps, useContextFromProps = true, scope) => {
  const context = useLanesContext() || {};
  const options = optionsFromProps || context?.options;
  const isSameOptions = isEqual(options, context?.options);
  const useContext = useContextFromProps && !!context && isSameOptions;
  const shouldSkip = skip || !!targetLanes || useContext;
  const rootLanesData = useRootLanes(context?.lanesModel?.viewedLane?.id, shouldSkip, options, scope);
  const searchResult = useSearchLanes(options?.search, shouldSkip);

  if (targetLanes) {
    if (!targetLanes.viewedLane) targetLanes.setViewedLane(context?.lanesModel?.viewedLane?.id);
    return {
      ...context,
      ...rootLanesData,
      lanesModel: targetLanes,
      searchResult,
    };
  }
  if (useContext) {
    return {
      ...context,
      searchResult,
    };
  }
  rootLanesData.lanesModel?.setViewedLane(context?.lanesModel?.viewedLane?.id);
  return {
    ...context,
    ...rootLanesData,
    searchResult,
  };
};
