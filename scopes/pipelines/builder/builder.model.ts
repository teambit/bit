import { ArtifactObject } from '@teambit/legacy/dist/consumer/component/sources/artifact-files';
import { AspectData, PipelineReport } from './build-pipeline-result-list';

export type BuilderData = {
  pipeline: PipelineReport[];
  artifacts: ArtifactObject[] | undefined;
  aspectsData: AspectData[];
  bitVersion?: string;
};

export const FILE_PATH_PARAM_DELIM = '~';
