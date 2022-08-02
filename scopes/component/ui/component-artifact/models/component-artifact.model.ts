export type Pipeline = {
  id: string;
  taskId: string;
  taskName: string;
  description: string;
  errors: Array<string>;
  warnings: Array<string>;
  startTime: number;
  endTime: number;
};

export type ArtifactFile = {
  name: string;
  path: string;
  content?: string;
  downloadUrl?: string;
};

export type Artifact = {
  name: string;
  taskId: string;
  description: string;
  taskName: string;
  files: Array<ArtifactFile>;
};

export type BuildArtifacts = {
  pipelines: Array<Pipeline>;
  artifacts: Array<Artifact>;
  buildStatus?: string;
};
