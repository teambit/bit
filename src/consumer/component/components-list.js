/** @flow */
import semver from 'semver';
import R from 'ramda';
import { Version, Component as ModelComponent } from '../../scope/models';
import { Scope } from '../../scope';
import Component from '../component';
import { BitId, BitIds } from '../../bit-id';
import logger from '../../logger/logger';
import BitMap from '../bit-map/bit-map';
import Consumer from '../consumer';
import { filterAsync } from '../../utils';
import { COMPONENT_ORIGINS } from '../../constants';

export type ObjectsList = Promise<{ [componentId: string]: Version }>;

export default class ComponentsList {
  consumer: Consumer;
  scope: Scope;
  bitMap: BitMap;
  _fromFileSystem: { [cacheKey: string]: Component[] } = {};
  _fromBitMap: { [cacheKey: string]: BitId[] } = {};
  _fromObjects: BitId[];
  _invalidComponents: string[];
  _modifiedComponents: Component[];
  constructor(consumer: Consumer) {
    this.consumer = consumer;
    this.scope = consumer.scope;
    this.bitMap = consumer.bitMap;
  }

  /**
   * List all objects where the id is the object-id and the value is the Version object
   * It is useful when checking for modified components where the most important data is the Ref.
   */
  async getFromObjects(): Promise<BitId[]> {
    if (!this._fromObjects) {
      const componentsObjects: ModelComponent[] = await this.scope.objects.listComponents(false);
      // const componentsVersionsP = {};
      // const componentsVersions = {};
      this._fromObjects = componentsObjects.map((componentObjects) => {
        // const latestVersionRef = componentObjects.versions[componentObjects.latest()];
        return new BitId({
          scope: componentObjects.scope,
          box: componentObjects.box,
          name: componentObjects.name,
          version: componentObjects.scope ? componentObjects.latest() : null
        });
        // componentsVersionsP[ObjId.toString()] = this.scope.getObject(latestVersionRef.hash);
      });

      // const allVersions = await Promise.all(R.values(componentsVersionsP));

      // Object.keys(componentsVersionsP).forEach((key, i) => {
      //   if (!allVersions[i]) {
      //     // the component has a REF of its latest version, however, the object of the latest version is missing
      //     const bitId = BitId.parse(key);
      //     logger.warn(
      //       `the model representation of ${bitId.toStringWithoutVersion()} is missing ${
      //         bitId.version
      //       } version, if this component is nested, this is a normal behavior, otherwise, the component is corrupted`
      //     );
      //     // throw new CorruptedComponent(bitId.toStringWithoutVersion(), bitId.version);
      //   }
      //   componentsVersions[key] = allVersions[i];
      // });

      // this._fromObjects = componentsVersions;
    }
    return this._fromObjects;
  }

  async _getAuthoredAndImportedFromFS(): Promise<Component[]> {
    let [authored, imported] = await Promise.all([
      this.getFromFileSystem(COMPONENT_ORIGINS.AUTHORED),
      this.getFromFileSystem(COMPONENT_ORIGINS.IMPORTED)
    ]);
    authored = authored || [];
    imported = imported || [];
    return authored.concat(imported);
  }

  /**
   * Components that are in the model (either, committed from a local scope or imported), and were
   * changed in the file system
   *
   * @param {boolean} [load=false] - Whether to load the component (false will return only the id)
   * @return {Promise<string[]>}
   */
  async listModifiedComponents(load: boolean = false): Promise<Array<BitId | Component>> {
    if (!this._modifiedComponents) {
      const fileSystemComponents = await this._getAuthoredAndImportedFromFS();
      this._modifiedComponents = await filterAsync(fileSystemComponents, (component) => {
        return this.consumer.getComponentStatusById(component.id).then(status => status.modified);
      });
    }
    if (load) return this._modifiedComponents;
    return this._modifiedComponents.map(component => component.id);
  }

  async listOutdatedComponents(): Promise<Component[]> {
    const fileSystemComponents = await this._getAuthoredAndImportedFromFS();
    const componentsFromModel = await this.scope.objects.listComponents(false);
    return fileSystemComponents.filter((component) => {
      const modelComponent = componentsFromModel.find(c => c.id() === component.id.toStringWithoutVersion());
      if (!modelComponent) return false;
      const latestVersion = modelComponent.latest();
      if (component.id.hasVersion() && semver.gt(latestVersion, component.id.version)) {
        component.latestVersion = latestVersion;
        return true;
      }
      return false;
    });
  }

  async newModifiedAndAutoTaggedComponents(): Promise<Component[]> {
    const [newComponents, modifiedComponents] = await Promise.all([
      this.listNewComponents(true),
      this.listModifiedComponents(true)
    ]);

    const autoTagPendingModel: ModelComponent[] = await this.listAutoTagPendingComponents();
    const autoTagPending: Component[] = await this.scope.toConsumerComponents(autoTagPendingModel);

    const components: Component[] = [...newComponents, ...modifiedComponents, ...autoTagPending];

    return Promise.all(components);
  }

  async authoredAndImportedComponents(): Promise<Component[]> {
    return this._getAuthoredAndImportedFromFS();
  }

  async idsFromObjects(): Promise<BitIds> {
    const fromObjects = await this.getFromObjects();
    return new BitIds(...fromObjects);
  }

  /**
   * Components that are registered in bit.map but have never been committed
   *
   * @param {boolean} [load=false] - Whether to load the component (false will return only the id)
   * @return {Promise.<string[] | Component[]>}
   * @memberof ComponentsList
   */
  async listNewComponents(load: boolean = false): Promise<BitIds | Component[]> {
    const idsFromBitMap = this.idsFromBitMap();
    const idsFromObjects = await this.idsFromObjects();
    const newComponents: BitId = [];
    idsFromBitMap.forEach((id: BitId) => {
      if (!idsFromObjects.findWithoutScopeAndVersion(id)) {
        newComponents.push(id);
      }
    });
    if (!load || !newComponents.length) return new BitIds(...newComponents);

    const { components } = await this.consumer.loadComponents(newComponents, false);
    return components;
  }

  /**
   * Authored exported components (easily identified by having a scope) which are not saved in the model are
   * import-pending. Exclude them from the 'newComponents' and add them to 'importPendingComponents'.
   */
  async listNewComponentsAndImportPending() {
    const allNewComponents: Component[] = await this.listNewComponents(true);
    const newComponents = [];
    const importPendingComponents = [];
    allNewComponents.forEach((component) => {
      if (component.id.scope) {
        importPendingComponents.push(component);
      } else {
        newComponents.push(component);
      }
    });
    return { newComponents, importPendingComponents };
  }

  async listCommitPendingOfAllScope(version: string, includeImported: boolean = false) {
    let commitPendingComponents;
    commitPendingComponents = this.idsFromBitMap(COMPONENT_ORIGINS.AUTHORED);
    if (includeImported) {
      const importedComponents = this.idsFromBitMap(COMPONENT_ORIGINS.IMPORTED);
      commitPendingComponents = commitPendingComponents.concat(importedComponents);
    }
    const commitPendingComponentsLatest = await this.scope.latestVersions(commitPendingComponents, false);
    const warnings = [];
    commitPendingComponentsLatest.forEach((componentId) => {
      if (semver.gt(componentId.version, version)) {
        warnings.push(`warning: ${componentId.toString()} has a version greater than ${version}`);
      }
    });
    return { commitPendingComponents, warnings };
  }

  /**
   * New and modified components are commit pending
   *
   * @return {Promise<string[]>}
   */
  async listCommitPendingComponents(): Promise<string[]> {
    const [newComponents, modifiedComponents] = await Promise.all([
      this.listNewComponents(),
      this.listModifiedComponents()
    ]);
    const modifiedComponentsWithoutScopeAndVersion = modifiedComponents.map(componentId =>
      componentId.toStringWithoutScopeAndVersion()
    );
    return [...newComponents, ...modifiedComponentsWithoutScopeAndVersion];
  }

  /**
   * Components from the model where the scope is local are pending for export
   * Also, components that their model version is higher than their bit.map version.
   */
  async listExportPendingComponents(load: boolean = false): Promise<BitId[] | ModelComponent[]> {
    const idsFromObjects = await this.idsFromObjects();
    const ids = await filterAsync(idsFromObjects, (componentId) => {
      return this.consumer.getComponentStatusById(componentId).then(status => status.staged);
    });
    if (!load) return ids;
    return Promise.all(ids.map(id => this.scope.sources.get(id)));
  }

  async listAutoTagPendingComponents(): Promise<ModelComponent[]> {
    const modifiedComponents = await this.listModifiedComponents();
    if (!modifiedComponents || !modifiedComponents.length) return [];
    const modifiedComponentsLatestVersions = await this.scope.latestVersions(modifiedComponents);
    return this.consumer.listComponentsForAutoTagging(modifiedComponentsLatestVersions);
  }

  idsFromBitMap(origin?: string): BitId[] {
    const fromBitMap = this.getFromBitMap(origin);
    return fromBitMap;
  }

  /**
   * Finds all components that are saved in the file system.
   * Components might be stored in the default component directory and also might be outside
   * of that directory. The bit.map is used to find them all
   * If they are on bit.map but not on the file-system, populate them to _invalidComponents property
   */
  async getFromFileSystem(origin?: string): Promise<Component[]> {
    const cacheKeyName = origin || 'all';
    if (!this._fromFileSystem[cacheKeyName]) {
      const idsFromBitMap = this.idsFromBitMap(origin);
      const { components, invalidComponents } = await this.consumer.loadComponents(idsFromBitMap, false);
      this._fromFileSystem[cacheKeyName] = components;
      if (!this._invalidComponents && !origin) {
        this._invalidComponents = invalidComponents;
      }
    }
    return this._fromFileSystem[cacheKeyName];
  }

  /**
   * components that are on bit.map but not on the file-system
   */
  async listInvalidComponents(): Promise<BitId[]> {
    if (!this._invalidComponents) {
      await this.getFromFileSystem();
    }
    return this._invalidComponents;
  }

  getFromBitMap(origin?: string): BitId[] {
    const cacheKeyName = origin || 'all';
    if (!this._fromBitMap[cacheKeyName]) {
      const originParam = origin ? [origin] : undefined;
      this._fromBitMap[cacheKeyName] = this.bitMap.getBitIds(originParam);
    }
    return this._fromBitMap[cacheKeyName];
  }

  static sortComponentsByName(components: Component[] | ModelComponent | string[]): Component[] | string[] {
    const getName = (component) => {
      let name;
      if (R.is(ModelComponent, component)) name = component.id();
      else if (R.is(Component, component)) name = component.id.toString();
      else name = component;
      return name.toUpperCase(); // ignore upper and lowercase
    };
    return components.sort((a, b) => {
      const nameA = getName(a);
      const nameB = getName(b);
      if (nameA < nameB) {
        return -1;
      }
      if (nameA > nameB) {
        return 1;
      }

      // names must be equal
      return 0;
    });
  }
}
