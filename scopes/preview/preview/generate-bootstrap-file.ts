export function generateBootstrapFile(filePaths: string[]): string {
  return `${filePaths.map(importOneFile).join('\n')}`;
}

function importOneFile(filePath: string) {
  return `import '${filePath}'`;
}
