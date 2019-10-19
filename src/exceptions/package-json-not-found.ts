export default class PackageJsonNotFound extends Error {
  constructor(packageJsonPath) {
    super(`The package.json in path "${packageJsonPath}" has not found
    `);
    this.name = 'PackageJsonNotExistsInException';
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.code = 'ENOENT';
  }
}
