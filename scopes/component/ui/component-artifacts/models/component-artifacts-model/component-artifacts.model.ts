export type ArtifactFile = {
  name: string;
  path: string;
  content?: string;
  downloadUrl?: string;
  size: number;
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

export function getArtifactFileDetailsFromUrl(
  artifacts: Array<Artifact>,
  fileFromUrl?: string
): { taskName: string; artifactName: string; artifactFile: ArtifactFile } | undefined {
  if (!fileFromUrl || !fileFromUrl.startsWith('~artifact/')) return undefined;
  const [, fileFromUrlParsed] = fileFromUrl.split('~artifact/');
  const [taskName, ...artifactNameAndPath] = fileFromUrlParsed.split('/');
  const [artifactName, ...path] = artifactNameAndPath;
  const filePath = path.join('/');
  const matchingArtifact = artifacts.find(
    (artifact) => artifact.taskName === taskName && artifact.name === artifactName
  );
  const matchingArtifactFile = matchingArtifact?.files.find((artifactFile) => artifactFile.path === filePath);

  if (!matchingArtifactFile) return undefined;

  return {
    taskName,
    artifactName,
    artifactFile: { ...matchingArtifactFile },
  };
}
