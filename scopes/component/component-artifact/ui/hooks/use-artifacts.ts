import { gql, QueryResult } from '@apollo/client';
import { useScopeQuery } from '@teambit/scope.ui.hooks.use-scope';
import { useDataQuery } from '@teambit/ui-foundation.ui.hooks.use-data-query';

const GET_BUILD_INFO = gql`
  query ComponentArtifacts($id: String!, $extensionId: String!) {
    getHost(id: $extensionId) {
      get(id: $id) {
        buidler: aspects(include: "teambit.pipelines/builder") {
          id
          data
        }
        buildStatus
      }
    }
  }
`;

// todo: move this to models
type Pipeline = {
  taskId: string | undefined;
  taskName: string | undefined;
  taskDescription: string | undefined;
  errors: Array<string> | undefined;
  startTime: Date | undefined;
  endTime: Date | undefined;
};

type Artifact = {
  name: string;
  generatedBy: string;
  storage: string;
  task: {
    id: string;
    name: string;
  };
  files: {
    refs: Array<{
      relativePath: string;
      refs: Array<{
        hash: string;
      }>;
    }>;
  };
};

type ArtifactModel = {
  buildStatus: string;
  pipelines: Array<Pipeline>;
  artifacts: Array<Artifact>;
};

export function useArtifacts(
  host: string,
  componentId: string
): { data?: ArtifactModel } & Omit<QueryResult<ArtifactModel>, 'data'> {
  const { data, ...rest } = useDataQuery(GET_BUILD_INFO, {
    variables: { id: componentId, extensionId: host },
  });

  let artifactData: ArtifactModel | undefined;

  if (data) {
    const {
      getHost: {
        get: { buildStatus, buidler: [builder] = [] },
      },
    } = data;
    const {
      data: { pipeline, artifacts, aspectsData },
    } = builder;

    artifactData = {
      buildStatus,
      pipelines: pipeline?.map((p) => mapToPipeline(p)) ?? [],
      artifacts: artifacts?.map((a) => a as Artifact) ?? [],
    };
  }

  const { loading } = useScopeQuery();

  return {
    ...rest,
    loading: rest.loading || !!loading,
    data: artifactData,
  };
}

//todo: move this to mappers
function mapToPipeline(data): Pipeline {
  const { startTime, endTime, ...rest } = data;
  return {
    ...rest,
    startTime: !!startTime ? new Date(startTime) : undefined,
    endTime: !!endTime ? new Date(endTime) : undefined,
  };
}
