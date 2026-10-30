export function getPackageNameFromTarget(targetPath: string): string {
  const normalized = targetPath.replace(/\\/g, '/');
  const nodeModulesIndex = normalized.lastIndexOf('node_modules');
  if (nodeModulesIndex === -1) return targetPath;
  const segments = normalized.substring(nodeModulesIndex).split('/');
  const isScoped = segments[1]?.startsWith('@');
  const packagePath = segments.slice(0, isScoped ? 3 : 2).join('/');
  return `./${packagePath}`;
}
