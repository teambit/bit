export function getPackageNameFromTarget(targetPath: string): string {
  const packagePath = targetPath.split('/').slice(0, 3).join('/');
  return `./${packagePath}`;
}
