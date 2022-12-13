import { Component, ComponentID } from '@teambit/component';
import gql from 'graphql-tag';
import { Logger } from '@teambit/logger';
import isBinaryPath from 'is-binary-path';
import { BuilderMain } from './builder.main.runtime';
import { PipelineReport } from './build-pipeline-result-list';

type ArtifactGQLFile = {
  /**
   * same as the path - used for GQL caching
   */
  id: string;
  /**
   * name of the artifact file
   */
  name: string;
  /**
   * path of the artifact file
   */
  path: string;
  /**
   * artifact file content (only for text files). Use /api/<component-id>/~aspect/builder/<extension-id>/~<path> to fetch binary file data
   */
  content?: string;
  /**
   * REST endpoint to fetch artifact data from. /api/<component-id>/~aspect/builder/<extension-id>/~<pat
   */
  downloadUrl?: string;
  /**
   * Remote storage url to resolve artifact file from
   */
  externalUrl?: string;
  /**
   * Size in bytes
   */
  size: number;
};

type ArtifactGQLData = {
  name: string;
  description?: string;
  storage?: string;
  generatedBy: string;
  files: ArtifactGQLFile[];
};
type TaskReport = PipelineReport & {
  artifact?: ArtifactGQLData;
  componentId: ComponentID;
};

export function builderSchema(builder: BuilderMain, logger: Logger) {
  return {
    typeDefs: gql`
      type TaskReport {
        # for GQL caching - taskId + taskName
        id: String!
        taskId: String!
        taskName: String!
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
        # name of the artifact file
        name: String
        # path of the artifact file
        path: String!
        # artifact file content (only for text files). Use /api/<component-id>/~aspect/builder/<extension-id>/~<path> to fetch binary file data
        content: String
        # REST endpoint to fetch artifact data from. /api/<component-id>/~aspect/builder/<extension-id>/~<pat
        downloadUrl: String
        # Remote storage url to resolve artifact file from
        externalUrl: String
        # size in bytes
        size: Int!
      }

      type Artifact {
        # for GQL caching -  PipelineId + Artifact Name
        id: String!
        # artifact name
        name: String!
        description: String
        storage: String
        generatedBy: String
        files: [ArtifactFile!]!
      }

      extend type Component {
        pipelineReport(taskId: String): [TaskReport!]!
      }
    `,

    resolvers: {
      Component: {
        pipelineReport: async (component: Component, { taskId }: { taskId?: string }) => {
          try {
            const builderData = builder.getBuilderData(component);
            const pipeline = builderData?.pipeline || [];
            const artifacts = taskId
              ? builder.getArtifactsByAspect(component, taskId)
              : builder.getArtifacts(component);
            const artifactsWithVinyl = await Promise.all(
              artifacts.map(async (artifact) => {
                const id = artifact.task.aspectId;
                const name = artifact.task.name as string;
                try {
                  const artifactFiles = (await builder.getArtifactsVinylByAspectAndTaskName(component, id, name)).map(
                    (vinyl) => {
                      const { basename, path, contents } = vinyl || {};
                      const isBinary = path && isBinaryPath(path);
                      const content = !isBinary ? contents?.toString('utf-8') : undefined;
                      const size = contents.byteLength;
                      const downloadUrl = encodeURI(
                        builder.getDownloadUrlForArtifact(component.id, artifact.task.aspectId, path)
                      );
                      const externalUrl = vinyl.url;
                      return { id: path, name: basename, path, content, downloadUrl, externalUrl, size };
                    }
                  );
                  return {
                    id: `${id}-${name}-${artifact.name}`,
                    name: artifact.name,
                    description: artifact.description,
                    task: artifact.task,
                    storage: artifact.storage,
                    generatedBy: artifact.generatedBy,
                    files: artifactFiles,
                  };
                } catch (e: any) {
                  logger.error(e.toString());
                  return {
                    id: `${id}-${name}-${artifact.name}`,
                    name: artifact.name,
                    description: artifact.description,
                    task: artifact.task,
                    storage: artifact.storage,
                    generatedBy: artifact.generatedBy,
                    files: [],
                  };
                }
              })
            );

            const result = pipeline.map((task) => ({
              ...task,
              artifact: artifactsWithVinyl.find(
                (data) => data.task.aspectId === task.taskId && data.task.name === task.taskName
              ),
            }));

            return result;
          } catch (e: any) {
            logger.error(e.toString());
            return [];
          }
        },
      },
      TaskReport: {
        id: (taskReport: TaskReport) => `${taskReport.taskId}-${taskReport.taskName}`,
        description: (taskReport: TaskReport) => taskReport.taskDescription,
        errors: (taskReport: TaskReport) => taskReport.errors?.map((e) => e.toString()) || [],
        warnings: (taskReport: TaskReport) => taskReport.warnings || [],
        artifact: async (taskReport: TaskReport, { path: pathFilter }: { path?: string }) => {
          if (!taskReport.artifact) return undefined;
          return {
            id: `${taskReport.taskId}-${taskReport.taskName}-${taskReport.artifact?.name}`,
            ...taskReport.artifact,
            files: taskReport.artifact.files.filter((file) => !pathFilter || file.path === pathFilter),
          };
        },
      },
    },
  };
}
