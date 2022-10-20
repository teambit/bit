export type ArtifactFile = {
  name: string;
  path: string;
  content?: string;
  downloadUrl?: string;
};

export type Artifact = {
  name: string;
  taskId: string;
  taskName: string;
  description?: string;
  files: Array<ArtifactFile>;
};

export type ComponentArtifactsGQLResponse = Array<{
  taskId: string;
  taskName: string;
  artifact: Artifact;
}>;

export function mapToArtifacts(gqlResponse: ComponentArtifactsGQLResponse): Artifact[] {
  return gqlResponse
    .filter((task) => task.artifact)
    .map((task) => ({
      ...task.artifact,
      taskId: task.taskId,
      taskName: task.taskName,
    }));
}
