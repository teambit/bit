import { Component, ComponentID } from '@teambit/component';
import gql from 'graphql-tag';
import { Scope } from '@teambit/legacy/dist/scope';
import { ArtifactObject } from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import isBinaryPath from 'is-binary-path';
import { BuilderData, BuilderMain } from './builder.main.runtime';
import { PipelineReport } from './build-pipeline-result-list';

export type BuilderGQLData = BuilderData & { id: ComponentID };
export type ArtifactGQLData = ArtifactObject & { componentId: ComponentID };
export const FILE_PATH_PARAM_DELIM = '~';

export function builderSchema(builder: BuilderMain, scope: Scope) {
  return {
    typeDefs: gql`
      type PipelineData {
        # task id: same as extension id
        id: String!
        name: String!
        description: String
        startTime: String
        endTime: String
        errors: [String!]
        warnings: [String!]
      }

      type ArtifactFileData {
        name: String!
        path: String!
        # artifact file content (only for text files). Use /api/<component-id>/~aspect/builder/<extension-id>/~<path> to fetch binary file data
        content: String
        downloadUrl: String
      }

      type ArtifactData {
        # aspect id that generated the artifact
        id: String!
        # artifact name
        name: String!
        # task name
        taskName: String!
        description: String
        # aspect id that generated the artifact
        generatedBy: String
        files(path: String): [ArtifactFileData!]!
        componentId: ComponentID!
      }

      type AspectData {
        # aspectId
        id: String!
        data: JSONObject
      }

      type BuilderData {
        # component id
        id: ComponentID!
        pipelines: [PipelineData!]!
        artifacts: [ArtifactData!]!
        aspectsData: [AspectData!]!
      }

      extend type Component {
        getBuilderData(extensionId: String): BuilderData!
      }
    `,
    resolvers: {
      Component: {
        getBuilderData: async (component: Component, { extensionId }: { extensionId?: string }) => {
          const builderData = builder.getBuilderData(component);
          const builderGQLData = {
            aspectsData:
              builderData?.aspectsData.map((aspectData) => ({ ...aspectData, id: aspectData.aspectId })) || [],
            artifacts: (builderData?.artifacts || []).map((artifact) => ({ ...artifact, componentId: component.id })),
            pipelines: builderData?.pipeline || [],
            id: component.id,
          };

          if (extensionId) {
            return {
              pipelines: builderGQLData.pipelines.filter((pipeline) => pipeline.taskId === extensionId),
              artifacts: builderGQLData.artifacts.filter((artifact) => artifact.task.id === extensionId),
              aspectsData: builderGQLData.aspectsData.filter((a) => a.aspectId === extensionId),
              id: component.id,
            };
          }

          return builderGQLData;
        },
      },
      PipelineData: {
        id: (pipelineData: PipelineReport) => pipelineData.taskId,
        name: (pipelineData: PipelineReport) => pipelineData.taskName,
        description: (pipelineData: PipelineReport) => pipelineData.taskDescription,
        startTime: (pipelineData: PipelineReport) => pipelineData.startTime,
        endTime: (pipelineData: PipelineReport) => pipelineData.endTime,
        errors: (pipelineData: PipelineReport) => pipelineData.errors?.map((e) => e.toString()),
        warnings: (pipelineData: PipelineReport) => pipelineData.warnings,
      },
      ArtifactData: {
        id: (artifactData: ArtifactGQLData) => artifactData.task.id,
        taskName: (artifactData: ArtifactGQLData) => artifactData.task.name,
        name: (artifactData: ArtifactGQLData) => artifactData.name,
        description: (artifactData: ArtifactGQLData) => artifactData.description,
        generatedBy: (artifactData: ArtifactGQLData) => artifactData.generatedBy,
        files: async (artifactData: ArtifactGQLData, { path: pathFilter }: { path?: string }) => {
          const files = (await artifactData.files.getVinylsAndImportIfMissing(artifactData.componentId._legacy, scope))
            .filter((vinyl) => !pathFilter || vinyl.path === pathFilter)
            .map(async (vinyl) => {
              const { basename, path, contents } = vinyl;
              const isBinary = isBinaryPath(path);
              const content = !isBinary ? contents.toString('utf-8') : undefined;
              const downloadUrl = encodeURI(
                `/api/${artifactData.componentId}/~aspect/builder/${artifactData.task.id}/${FILE_PATH_PARAM_DELIM}${path}`
              );
              return { name: basename, path, content, downloadUrl };
            });

          return files;
        },
      },
    },
  };
}
