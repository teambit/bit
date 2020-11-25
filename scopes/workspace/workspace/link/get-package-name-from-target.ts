export function getPackageNameFromTarget(targetPath: string): string {
  const subPath = targetPath.substring(targetPath.lastIndexOf('node_modules'));
  const packagePath = subPath.split('/').slice(0, 3).join('/');
  return `./${packagePath}`;
}
