export class NonAspectCorePackageLinkError extends Error {
  constructor(private err: Error, packageName: string) {
    super(`failed linking non aspect core package (${packageName}) with the following error: ${err.toString()}`);
  }
}
