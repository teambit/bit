export type ArtifactFile = {
  name: string;
  path: string;
  content?: string;
  downloadUrl?: string;
};

export type Artifact = {
  name: string;
  description?: string;
  files: Array<ArtifactFile>;
};

export type TaskReport = {
  id: string;
  taskId: string;
  taskName: string;
  description?: string;
  errors: Array<string>;
  warnings: Array<string>;
  startTime?: number;
  endTime?: number;
  artifact: Artifact;
};

export type ComponentPipelineModel = {
  pipeline: TaskReport[];
};
