import { Component } from '@teambit/component';
import { BitId } from 'bit-bin/dist/bit-id';
import ConsumerComponent from 'bit-bin/dist/consumer/component';
import { Dependencies, DependenciesFilterFunction } from 'bit-bin/dist/consumer/component/dependencies';
import componentIdToPackageName from 'bit-bin/dist/utils/bit/component-id-to-package-name';

import { DependenciesObjectDefinition, SemverVersion } from './types';

export type DepVersionModifierFunc = (
  depId: BitId,
  depPackageName: string,
  currentVersion?: SemverVersion
) => Promise<SemverVersion>;
// TODO: consider raname this class, it's not really a graph since it has only the first level
export class DependencyGraph {
  constructor(private component: Component) {}

  async toJson(
    filterFunc?: DependenciesFilterFunction,
    depVersionModifierFunc: DepVersionModifierFunc = defaultVersionModifier
  ): Promise<DependenciesObjectDefinition> {
    const consumerComponent: ConsumerComponent = this.component.state._consumer;
    const devCompDeps = await this.toPackageJson(
      this.component,
      consumerComponent.devDependencies,
      filterFunc,
      depVersionModifierFunc
    );
    const runtimeCompDeps = await this.toPackageJson(
      this.component,
      consumerComponent.dependencies,
      filterFunc,
      depVersionModifierFunc
    );
    const json = {
      dependencies: {
        ...runtimeCompDeps,
        ...consumerComponent.packageDependencies,
      },
      devDependencies: {
        ...devCompDeps,
        ...consumerComponent.devPackageDependencies,
      },
      peerDependencies: {
        ...consumerComponent.peerPackageDependencies,
      },
    };
    return json;
  }

  private async toPackageJson(
    component: Component,
    dependencies: Dependencies,
    filterFunc?: DependenciesFilterFunction,
    depVersionModifierFunc: DepVersionModifierFunc = defaultVersionModifier
  ): Promise<Record<string, string>> {
    let dependenciesToUse = dependencies;
    if (filterFunc && typeof filterFunc === 'function') {
      dependenciesToUse = dependencies.filter(filterFunc);
    }

    const result = {};

    const buildResultP = dependenciesToUse.getAllIds().map(async (depId: BitId) => {
      const packageName = componentIdToPackageName({
        ...component.state._consumer,
        id: depId,
        isDependency: true,
      });
      const dependencyVersion = await depVersionModifierFunc(depId, packageName, depId.version);
      result[packageName] = dependencyVersion;
      return Promise.resolve();
    }, {});
    if (buildResultP.length) {
      await Promise.all(buildResultP);
    }

    return result;
  }
}

async function defaultVersionModifier(depId: BitId): Promise<SemverVersion> {
  const newVersion = '0.0.1-new';
  const version = depId.hasVersion() ? (depId.version as SemverVersion) : newVersion;
  return Promise.resolve(version);
}
