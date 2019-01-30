// @flow
import Capsule from '@bit/bit.capsule-dev.core.capsule';
import createCapsule from './capsule-factory';
import Consumer from '../consumer/consumer';
import { Scope, ComponentWithDependencies } from '../scope';
import { BitId } from '../bit-id';
import ManyComponentsWriter from '../consumer/component-ops/many-components-writer';
import logger from '../logger/logger';

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
    logger.debug(`Isolator.getInstance, creating a capsule with an ${containerType} container`);
    const capsule = await createCapsule(containerType);
    return new Isolator(capsule, scope, consumer);
  }

  async writeComponent(id: BitId, opts: Object) {
    const componentWithDependencies = await this.loadComponent(id);
    const writeToPath = opts.writeToPath;
    const concreteOpts = {
      // consumer: this.consumer,
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
      isolated: true,
      capsule: this.capsule
    };
    const manyComponentsWriter = new ManyComponentsWriter(concreteOpts);
    await manyComponentsWriter.writeAllToIsolatedCapsule(this.capsule);
    throw new Error('stop here for now');
  }

  async loadComponent(id: BitId): Promise<ComponentWithDependencies> {
    return this.consumer ? await this.loadComponentFromConsumer(id) : this.loadComponentFromScope(id);
  }

  async loadComponentFromConsumer(id: BitId): Promise<ComponentWithDependencies> {
    const consumer = this.consumer;
    if (!consumer) throw new Error('missing consumer');
    const component = await consumer.loadComponent(id);
    const { components: dependencies } = await consumer.loadComponents(component.dependencies.getAllIds());
    const { components: devDependencies } = await consumer.loadComponents(component.devDependencies.getAllIds());
    const { components: compilerDependencies } = await consumer.loadComponents(
      component.compilerDependencies.getAllIds()
    );
    const { components: testerDependencies } = await consumer.loadComponents(component.testerDependencies.getAllIds());
    return new ComponentWithDependencies({
      component,
      dependencies,
      devDependencies,
      compilerDependencies,
      testerDependencies
    });
  }

  async loadComponentFromScope(id: BitId): Promise<ComponentWithDependencies> {}
}
