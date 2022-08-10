import { Component, ComponentID } from '@teambit/component';
import gql from 'graphql-tag';
import isBinaryPath from 'is-binary-path';
import { BuilderMain } from './builder.main.runtime';
import { PipelineReport } from './build-pipeline-result-list';

type ArtifactGQLFile = {
  id: string;
  name: string;
  path: string;
  content?: string;
  downloadUrl?: string;
};

type ArtifactGQLData = { name: string; description?: string; files: ArtifactGQLFile[] };
type TaskReport = PipelineReport & {
  artifact?: ArtifactGQLData;
  componentId: ComponentID;
};

export function builderSchema(builder: BuilderMain) {
  return {
    typeDefs: gql`
      type TaskReport {
        id: String!
        name: String!
        description: String
        startTime: String
        endTime: String
        errors: [String!]
        warnings: [String!]
        artifact(path: String): Artifact
      }

      type ArtifactFile {
        # for GQL caching - same as the path
        id: String!
        name: String
        path: String!
        # artifact file content (only for text files). Use /api/<component-id>/~aspect/builder/<extension-id>/~<path> to fetch binary file data
        content: String
        downloadUrl: String
      }

      type Artifact {
        # artifact name
        name: String
        description: String
        files: [ArtifactFile!]!
      }

      extend type Component {
        pipelineReport(taskId: String): [TaskReport!]!
      }
    `,

    resolvers: {
      Component: {
        pipelineReport: async (component: Component, { taskId }: { taskId?: string }) => {
          const builderData = builder.getBuilderData(component);
          const pipeline = builderData?.pipeline || [];
          const artifacts = taskId
            ? builder.getArtifactsByExtension(component, taskId).toArray()
            : builderData?.artifacts.toArray() || [];
          const artifactsByTask = artifacts.reduce((accum, next) => {
            console.log('🚀 ~ file: builder.graphql.ts ~ line 66 ~ artifactsByTask ~ next', next);
            const id = next.task.aspectId;
            const artifactFiles = builder.getArtifactsVinylByExtension(component, id);
            const artifactGQLData = { ...next.toObject(), files: artifactFiles };
            accum[id] = artifactGQLData;
            return accum;
          }, {});

          const result = pipeline.map(async (task) => ({
            ...task,
            artifact: (await artifactsByTask[task.taskId]).map(({ vinyl }) => {
              const { basename, path, contents } = vinyl || {};
              const isBinary = path && isBinaryPath(path);
              const content = !isBinary ? contents?.toString('utf-8') : undefined;
              const downloadUrl = encodeURI(builder.getDownloadUrlForArtifact(component.id, task.taskId, path));
              const artifactGqlFile: ArtifactGQLFile = { id: path, name: basename, path, content, downloadUrl };
              return artifactGqlFile;
            }),
          }));

          return result;
        },
      },
      TaskReport: {
        id: (taskReport: TaskReport) => taskReport.taskId,
        name: (taskReport: TaskReport) => taskReport.taskName,
        description: (taskReport: TaskReport) => taskReport.taskDescription,
        errors: (taskReport: TaskReport) => taskReport.errors?.map((e) => e.toString()) || [],
        warnings: (taskReport: TaskReport) => taskReport.warnings || [],
        artifact: async (taskReport: TaskReport, { path: pathFilter }: { path?: string }) => {
          if (!taskReport.artifact) return undefined;

          return {
            ...taskReport.artifact,
            files: taskReport.artifact.files.filter((file) => !pathFilter || file.path === pathFilter),
          };
        },
      },
    },
  };
}
