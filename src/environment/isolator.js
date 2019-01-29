// @flow
import R from 'ramda';
import Capsule from '@bit/bit.capsule-dev.core.capsule';
import createCapsule from './capsule-factory';
import Consumer from '../consumer/consumer';
import { Scope, ComponentWithDependencies } from '../scope';
import { buildComponentsGraph, getFlattenedDependencies } from '../scope/component-ops/tag-model-component';
import { BitId } from '../bit-id';
import { ModelComponent, Version } from '../scope/models';
import Component from '../consumer/component/consumer-component';
import CompilerExtension from '../extensions/compiler-extension';
import TesterExtension from '../extensions/tester-extension';
import BitIds from '../bit-id/bit-ids';
import ManyComponentsWriter from '../consumer/component-ops/many-components-writer';

export default class Isolator {
  capsule: Capsule;
  consumer: ?Consumer;
  scope: Scope;
  constructor(capsule: Capsule, scope: Scope, consumer?: Consumer) {
    this.capsule = capsule;
    this.scope = scope;
    this.consumer = consumer;
  }

  static async getInstance(containerType: string = 'fs', scope: Scope, consumer?: Consumer) {
    const capsule = await createCapsule(containerType);
    return new Isolator(capsule, scope, consumer);
  }

  async writeComponent(id: BitId, opts: Object) {
    const componentWithDependencies = await this.loadComponent(id);
    const writeToPath = opts.writeToPath;
    const concreteOpts = {
      consumer: this.consumer,
      componentsWithDependencies: [componentWithDependencies],
      writeToPath,
      override: opts.override,
      writePackageJson: !opts.noPackageJson,
      writeConfig: opts.conf,
      writeBitDependencies: opts.writeBitDependencies,
      createNpmLinkFiles: opts.createNpmLinkFiles,
      saveDependenciesAsComponents: opts.saveDependenciesAsComponents !== false,
      writeDists: opts.dist,
      installNpmPackages: !!opts.installPackages, // convert to boolean
      installPeerDependencies: !!opts.installPackages, // convert to boolean
      addToRootPackageJson: false,
      verbose: opts.verbose,
      excludeRegistryPrefix: !!opts.excludeRegistryPrefix,
      silentPackageManagerResult: opts.silentPackageManagerResult,
      capsule: this.capsule
    };
    const manyComponentsWriter = new ManyComponentsWriter(concreteOpts);
    await writeComponents(concreteOpts);
  }

  async loadComponent(id: BitId): Promise<ComponentWithDependencies> {
    return this.consumer
      ? await this.loadComponentFromConsumer(id)
      : this.loadComponentFromScope(id);
    throw new Error('stop here for now');
  }

  async loadComponentFromConsumer(id: BitId): Promise<ComponentWithDependencies> {
    if (!this.consumer) throw new Error('missing consumer');
    const component = await this.consumer.loadComponent(id);
    const { components: dependencies } = await this.consumer.loadComponents(component.dependencies.getAllIds());
    const { components: devDependencies } = await this.consumer.loadComponents(component.devDependencies.getAllIds());
    const { components: compilerDependencies } = await this.consumer.loadComponents(component.compilerDependencies.getAllIds());
    const { components: testerDependencies } = await this.consumer.loadComponents(component.testerDependencies.getAllIds());
    return new ComponentWithDependencies({ component, dependencies, devDependencies, compilerDependencies, testerDependencies });
    const { graphDeps, graphDevDeps, graphCompilerDeps, graphTesterDeps } = buildComponentsGraph([component]);

    const dependenciesCache = {};
    const notFoundDependencies = new BitIds();
    const flattenedDependencies = await getFlattenedDependencies(this.scope, component, graphDeps, dependenciesCache, notFoundDependencies);
    const flattenedDevDependencies = await getFlattenedDependencies(
      this.scope,
      component,
      graphDevDeps,
      dependenciesCache,
      notFoundDependencies,
      graphDeps
    );
    const flattenedCompilerDependencies = await getFlattenedDependencies(
      this.scope,
      component,
      graphCompilerDeps,
      dependenciesCache,
      notFoundDependencies,
      graphDeps
    );
    const flattenedTesterDependencies = await getFlattenedDependencies(
      this.scope,
      component,
      graphTesterDeps,
      dependenciesCache,
      notFoundDependencies,
      graphDeps
    );
    const modelComponent: ModelComponent = await this.scope.sources.findOrAddComponent(component);
    const getVersionFromModel = async (): Promise<?Version> => {
      const versionFromFs = component.id.version;
      if (!versionFromFs) return null;
      const versionRef = modelComponent.versions[versionFromFs];
      if (!versionRef) return null;
      // $FlowFixMe
      return this.scope.getObject(versionRef.hash);
    };
    const versionFromModel = await getVersionFromModel();
    const { version } = await this.scope.sources.consumerComponentToVersion({
      consumerComponent: component,
      consumer: this.consumer,
      flattenedDependencies,
      flattenedDevDependencies,
      flattenedCompilerDependencies,
      flattenedTesterDependencies,
      versionFromModel
    });
    const versionStr = component.id.hasVersion() ? component.version : '0.0.1';
    return modelComponent.toConsumerComponent(versionStr, this.scope.name, this.scope.objects, null, version);
  }

  // new = load from consumer, load all dependencies. write.
  // imported = load from consumer, add sharedDir, load all dependencies, write.

  async toConsumerComponentWithoutDirManipulation(originalComponent: Component, version: Version) {
    const repository = this.scope.objects;
    const compilerP = CompilerExtension.loadFromModelObject(version.compiler, repository);
    const testerP = TesterExtension.loadFromModelObject(version.tester, repository);
    const [compiler, tester] = await Promise.all([compilerP, testerP]);
    // when generating a new ConsumerComponent out of Version, it is critical to make sure that
    // all objects are cloned and not copied by reference. Otherwise, every time the
    // ConsumerComponent instance is changed, the Version will be changed as well, and since
    // the Version instance is saved in the Repository._cache, the next time a Version instance
    // is retrieved, it'll be different than the first time.
    const consumerComponent = new Component({
      name: originalComponent.name,
      version: originalComponent.version,
      scope: originalComponent.scope,
      lang: originalComponent.lang,
      bindingPrefix: originalComponent.bindingPrefix,
      mainFile: version.mainFile,
      compiler,
      tester,
      detachedCompiler: version.detachedCompiler,
      detachedTester: version.detachedTester,
      dependencies: version.dependencies.getClone(),
      devDependencies: version.devDependencies.getClone(),
      compilerDependencies: version.compilerDependencies.getClone(),
      testerDependencies: version.testerDependencies.getClone(),
      flattenedDependencies: version.flattenedDependencies.clone(),
      flattenedDevDependencies: version.flattenedDevDependencies.clone(),
      flattenedCompilerDependencies: version.flattenedCompilerDependencies.clone(),
      flattenedTesterDependencies: version.flattenedTesterDependencies.clone(),
      packageDependencies: R.clone(version.packageDependencies),
      devPackageDependencies: R.clone(version.devPackageDependencies),
      peerPackageDependencies: R.clone(version.peerPackageDependencies),
      compilerPackageDependencies: R.clone(version.compilerPackageDependencies),
      testerPackageDependencies: R.clone(version.testerPackageDependencies),
      files: version.files,
      dists: version.dists,
      docs: version.docs,
      license: originalComponent.license,
      specsResults: version.specsResults ? version.specsResults.map(res => SpecsResults.deserialize(res)) : null,
      log: version.log,
      customResolvedPaths: R.clone(version.customResolvedPaths),
      deprecated: originalComponent.deprecated
    });
    return consumerComponent;
  }

  async loadComponentFromScope(id: BitId) {}
}
