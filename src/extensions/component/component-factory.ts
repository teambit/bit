/* eslint-disable max-classes-per-file */
import Isolator from '../isolator/isolator';
import ConsumerComponent from '../../consumer/component';
import Component from './component';
import State from './state';
import ComponentID from './id';

export type ConfigFunc = () => any;

export default class ComponentFactory {
  constructor(
    /**
     * instance of the capsule orchestrator
     */
    private isolateEnv: Isolator // private configsRegistry: Registry
  ) {}

  /**
   * registry for config modifications function
   */
  registerAddConfig(extensionId, configFunc: ConfigFunc) {
    ConsumerComponent.registerAddConfigAction(extensionId, configFunc);
  }

  create() {}

  /**
   * instantiate a component object from a legacy `ConsumerComponent` type object.
   */
  fromLegacyComponent(legacyComponent: ConsumerComponent): Component {
    return new Component(
      ComponentID.fromLegacy(legacyComponent.id),
      null,
      State.fromLegacy(legacyComponent),
      undefined,
      this.isolateEnv
    );
  }

  // private async getConfigFromExtensions(legacyComponent: ConsumerComponent) {
  //   const extensionsConfigModificationsP = this.configsRegistry.keys.map(entry => {
  //     // TODO: only running func for relevant extensions
  //     const func = this.configsRegistry.get(entry);
  //     return func()
  //   });
  //   const extensionsConfigModifications = await Promise.all(extensionsConfigModificationsP);
  //   const extensionsConfigModificationsObject = mergeAll(extensionsConfigModifications);
  //   return extensionsConfigModificationsObject;
  // }
}

// export class Registry {
//   private configHooks = {};

//   /**
//    * get a config func from the registry.
//    */
//   get(name: string) {
//     const hook = this.configHooks[name];
//     // if (!hook) throw new GeneralError(`there is no config hook for ${name}`);
//     return hook;
//   }

//   get keys() {
//     return Object.keys(this.configHooks);
//   }

//   /**
//    * set a config func to the registry.
//    */
//   set(name, configFunc: ConfigFunc) {
//     this.configHooks[name] = configFunc;
//     return this;
//   }
// }
