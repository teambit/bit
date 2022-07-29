import { Component, ComponentID } from '@teambit/component';
import gql from 'graphql-tag';
import { Scope } from '@teambit/legacy/dist/scope';
import { ArtifactObject } from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import isBinaryPath from 'is-binary-path';
import { BuilderData, BuilderMain } from './builder.main.runtime';
import { PipelineReport } from './build-pipeline-result-list';

export type BuilderGQLData = BuilderData & { id: ComponentID };
export type ArtifactGQLData = ArtifactObject & { componentId: ComponentID };

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
        # artifact file content (only for text files). Use /builder/{extension}/{name} to fetch binary files.
        content: String
        downloadUrl: String
      }

      type ArtifactData {
        # same as artifact name
        id: String!
        componentId: ComponentID!
        # artifact name
        name: String!
        description: String
        # pipeline data
        generatedBy: String
        files: [ArtifactFileData!]!
      }

      type AspectData {
        # aspectId
        id: String!
        data: JSONObject
      }

      type BuilderData {
        # component id
        id: ComponentID!
        pipelines(taskId: String, taskName: String): [PipelineData!]
        artifacts(name: String): [ArtifactData!]
        aspectData(aspectId: String): [AspectData!]
      }

      extend type Component {
        getBuilderData: BuilderData!
      }
    `,
    resolvers: {
      Component: {
        getBuilderData: async (component: Component) => {
          const builderData = builder.getBuilderData(component) || {};
          return { ...builderData, id: component.id };
        },
      },
      BuilderData: {
        pipelines: (builderData: BuilderGQLData, { taskId, taskName }: { taskId?: string; taskName?: string }) => {
          if (taskId && taskName) {
            return builderData.pipeline.filter((p) => p.taskId === taskId && p.taskName === taskName) || [];
          }
          if (taskId) return builderData.pipeline.filter((p) => p.taskId === taskId) || [];
          if (taskName) return builderData.pipeline.filter((p) => p.taskName === taskName) || [];
          return builderData.pipeline || [];
        },
        artifacts: (builderData: BuilderGQLData, { name }: { name?: string }) => {
          if (name) {
            return (builderData?.artifacts?.filter((artifact) => artifact.name === name) || []).map((artifact) => ({
              ...artifact,
              componentId: builderData.id,
            }));
          }
          return (builderData.artifacts || []).map((artifact) => ({
            ...artifact,
            componentId: builderData.id,
          }));
        },
        aspectData: (builderData: BuilderGQLData, { aspectId }: { aspectId?: string }) => {
          if (aspectId) {
            return builderData.aspectsData.filter((a) => a.aspectId === aspectId) || [];
          }
          return builderData.aspectsData || [];
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
        id: (artifactData: ArtifactGQLData) => artifactData.name,
        name: (artifactData: ArtifactGQLData) => artifactData.name,
        description: (artifactData: ArtifactGQLData) => artifactData.description,
        generatedBy: (artifactData: ArtifactGQLData) => artifactData.generatedBy,
        files: async (artifactData: ArtifactGQLData) => {
          const files = (
            await artifactData.files.getVinylsAndImportIfMissing(artifactData.componentId._legacy, scope)
          ).map(async (vinyl) => {
            const { basename, path, contents } = vinyl;
            const isBinary = isBinaryPath(path);
            const content = !isBinary ? contents.toString('utf-8') : undefined;
            const downloadUrl = encodeURI(`/builder/${artifactData.task.id}/${basename}`);
            return { name: basename, path, content, downloadUrl };
          });
          return files;
        },
      },
    },
  };
}
