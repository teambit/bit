import { PkgEntry } from './config-merger.main.runtime';

type UsedBy = { compIdStr: string; version: string };

type Deps = { [depId: string]: UsedBy[] };

export class AggregatedDeps {
  private deps: Deps = {};

  push(pkg: PkgEntry, compIdStr: string) {
    if (pkg.force) return; // we only care about auto-detected dependencies
    if (!this.deps[pkg.name]) this.deps[pkg.name] = [];
    this.deps[pkg.name].push({ compIdStr: compIdStr, version: pkg.version });
  }

  get depsNames(): string[] {
    return Object.keys(this.deps);
  }

  getCompIdsBy(pkgName: string): string[] {
    return this.deps[pkgName].map((dep) => dep.compIdStr);
  }

  hasSameVersions(pkgName: string): boolean {
    const versions = this.deps[pkgName].map((dep) => dep.version);
    return versions.every((v) => v === versions[0]);
  }

  getFirstVersion(pkgName: string): string {
    return this.deps[pkgName][0].version;
  }

  reportMultipleVersions(pkgName: string): string {
    const compIdsPerVersion = this.getCompIdsPerVersion(pkgName);
    const versions = Object.keys(compIdsPerVersion);
    const multipleVerStr = versions
      .map((version) => {
        const compIds = compIdsPerVersion[version];
        const compIdsStr = compIds.length > 1 ? `${compIds[0]} and ${compIds.length - 1} more` : compIds[0];
        return `${this.getVersionStr(version)} (by ${compIdsStr})`;
      })
      .join(', ');
    return `multiple versions found. ${multipleVerStr}`;
  }

  toString(): string {
    return JSON.stringify(this.deps, null, 2);
  }

  private getVersionStr(version: string): string {
    if (version.includes('::')) {
      // in case of a conflict, the version is in a format of CONFLICT::OURS::THEIRS
      const [, , otherVal] = version.split('::');
      return otherVal;
    }
    return version;
  }

  private getCompIdsPerVersion(pkgName: string): { [version: string]: string[] } {
    const compIdsPerVersion: { [version: string]: string[] } = {};
    this.deps[pkgName].forEach((dep) => {
      if (!compIdsPerVersion[dep.version]) compIdsPerVersion[dep.version] = [];
      compIdsPerVersion[dep.version].push(dep.compIdStr);
    });
    return compIdsPerVersion;
  }
}
