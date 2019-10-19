export default class PackageJsonAlreadyExists extends Error {
  constructor(packageJsonPath) {
    super(`The package.json in path "${packageJsonPath}" already exists
    `);
    this.name = 'PackageJsonAlreadyExistsInException';
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    this.code = 'PJSONEX';
  }
}
