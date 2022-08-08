import { ArtifactObject } from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import { AspectData, PipelineReport } from './build-pipeline-result-list';
import { ArtifactsStorageResolver } from './storage';

export type BuilderData = {
  pipeline: PipelineReport[];
  artifacts: ArtifactObject[] | undefined;
  aspectsData: AspectData[];
  bitVersion?: string;
};

export const FILE_PATH_PARAM_DELIM = '~';
export type ArtifactPropsToPopulate = {
  aspectName: string;
  /**
   * Name of the artifact to populate
   */
  name?: string;
};

export type ArtifactsToPopulate = ArtifactPropsToPopulate[];

export type StorageResolversMap = {
  [resolverName: string]: ArtifactsStorageResolver;
};
