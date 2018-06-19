/** @flow */
import semver from 'semver';
import R from 'ramda';
import { Version, Component as ModelComponent } from '../../scope/models';
import { Scope } from '../../scope';
import Component from '../component';
import { BitId } from '../../bit-id';
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
  _fromFileSystem: Promise<string[]> = [];
  _fromBitMap: Object = {};
  _fromObjects: ObjectsList;
  _deletedComponents: string[];
  constructor(consumer: Consumer) {
    this.consumer = consumer;
    this.scope = consumer.scope;
    this.bitMap = consumer.bitMap;
  }

  /**
   * List all objects where the id is the object-id and the value is the Version object
   * It is useful when checking for modified components where the most important data is the Ref.
   */
  async getFromObjects(): ObjectsList {
    if (!this._fromObjects) {
      const componentsObjects = await this.scope.objects.listComponents(false);
      const componentsVersionsP = {};
      const componentsVersions = {};
      componentsObjects.forEach((componentObjects) => {
        const latestVersionRef = componentObjects.versions[componentObjects.latest()];
        const ObjId = new BitId({
          scope: componentObjects.scope,
          box: componentObjects.box,
          name: componentObjects.name,
          version: componentObjects.scope ? componentObjects.latest() : null
        });
        componentsVersionsP[ObjId.toString()] = this.scope.getObject(latestVersionRef.hash);
      });

      const allVersions = await Promise.all(R.values(componentsVersionsP));

      Object.keys(componentsVersionsP).forEach((key, i) => {
        if (!allVersions[i]) {
          // the component has a REF of its latest version, however, the object of the latest version is missing
          const bitId = BitId.parse(key);
          logger.warn(
            `the model representation of ${bitId.toStringWithoutVersion()} is missing ${
              bitId.version
            } version, if this component is nested, this is a normal behavior, otherwise, the component is corrupted`
          );
          // throw new CorruptedComponent(bitId.toStringWithoutVersion(), bitId.version);
        }
        componentsVersions[key] = allVersions[i];
      });
      // $FlowFixMe
      this._fromObjects = componentsVersions;
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
    const fileSystemComponents = await this._getAuthoredAndImportedFromFS();
    const modifiedComponents = await filterAsync(fileSystemComponents, (component) => {
      return this.consumer.getComponentStatusById(component.id).then(status => status.modified);
    });
    if (load) return modifiedComponents;
    return modifiedComponents.map(component => component.id);
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

  async newAndModifiedComponents(): Promise<Component[]> {
    const [newComponents, modifiedComponents] = await Promise.all([
      this.listNewComponents(true),
      this.listModifiedComponents(true)
    ]);

    const components = [...newComponents, ...modifiedComponents];

    return Promise.all(components);
  }

  async idsFromObjects(withScope: boolean = true): Promise<string[]> {
    const fromObjects = await this.getFromObjects();
    const ids = Object.keys(fromObjects);
    if (withScope) return ids;
    return ids.map(id => BitId.parse(id).toStringWithoutScopeAndVersion());
  }

  /**
   * Components that are registered in bit.map but have never been committed
   *
   * @param {boolean} [load=false] - Whether to load the component (false will return only the id)
   * @return {Promise.<string[] | Component[]>}
   * @memberof ComponentsList
   */
  async listNewComponents(load: boolean = false): Promise<Array<string | Component>> {
    const idsFromBitMap = await this.idsFromBitMap(false);
    const idsFromObjects = await this.idsFromObjects(false);
    const newComponents = [];
    idsFromBitMap.forEach((id) => {
      if (!idsFromObjects.includes(id)) {
        newComponents.push(id);
      }
    });
    if (!load || !newComponents.length) return newComponents;

    const componentsIds = newComponents.map(id => BitId.parse(id));
    const { components } = await this.consumer.loadComponents(componentsIds, false);
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
    commitPendingComponents = await this.idsFromBitMap(true, COMPONENT_ORIGINS.AUTHORED);
    if (includeImported) {
      const importedComponents = await this.idsFromBitMap(true, COMPONENT_ORIGINS.IMPORTED);
      commitPendingComponents = commitPendingComponents.concat(importedComponents);
    }
    const commitPendingComponentsIds = commitPendingComponents.map(componentId => BitId.parse(componentId));
    const commitPendingComponentsLatest = await this.scope.latestVersions(commitPendingComponentsIds, false);
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
   * @return {Promise<string[]>}
   */
  async listExportPendingComponents(load: boolean = false): Promise<string[] | ModelComponent[]> {
    const idsFromObjects = await this.idsFromObjects();
    const ids = await filterAsync(idsFromObjects, (componentId) => {
      return this.consumer.getComponentStatusById(BitId.parse(componentId)).then(status => status.staged);
    });
    if (!load) return ids;
    return Promise.all(ids.map(id => this.scope.sources.get(BitId.parse(id))));
  }

  async listAutoTagPendingComponents(): Promise<ModelComponent[]> {
    const modifiedComponents = await this.listModifiedComponents();
    if (!modifiedComponents || !modifiedComponents.length) return [];
    const modifiedComponentsLatestVersions = await this.scope.latestVersions(modifiedComponents);
    return this.consumer.listComponentsForAutoTagging(modifiedComponentsLatestVersions);
  }

  async idsFromBitMap(withScopeName: boolean = true, origin?: string): Promise<string[]> {
    const fromBitMap = this.getFromBitMap(origin);
    const ids = Object.keys(fromBitMap);
    if (withScopeName) return ids;
    return ids.map(id => BitId.parse(id).toStringWithoutScopeAndVersion());
  }

  /**
   * Finds all components that are saved in the file system.
   * Components might be stored in the default component directory and also might be outside
   * of that directory. The bit.map is used to find them all
   * If they are on bit.map but not on the file-system, populate them to _deletedComponents property
   * @return {Promise<Component[]>}
   */
  async getFromFileSystem(origin?: string): Promise<Component[]> {
    const cacheKeyName = origin || 'all';
    if (!this._fromFileSystem[cacheKeyName]) {
      const idsFromBitMap = await this.idsFromBitMap(true, origin);
      const parsedBitIds = idsFromBitMap.map(id => BitId.parse(id));
      const { components, deletedComponents } = await this.consumer.loadComponents(parsedBitIds, false);
      this._fromFileSystem[cacheKeyName] = components;
      if (!this._deletedComponents && !origin) {
        this._deletedComponents = deletedComponents;
      }
    }
    return this._fromFileSystem[cacheKeyName];
  }

  /**
   * components that are on bit.map but not on the file-system
   */
  async listDeletedComponents(): Promise<BitId[]> {
    if (!this._deletedComponents) {
      await this.getFromFileSystem();
    }
    return this._deletedComponents;
  }

  getFromBitMap(origin?: string): Object {
    const cacheKeyName = origin || 'all';
    if (!this._fromBitMap[cacheKeyName]) {
      this._fromBitMap[cacheKeyName] = this.bitMap.getAllComponents(origin);
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
