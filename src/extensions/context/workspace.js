/** @flow */
import { loadConsumer, Consumer } from '../../consumer';
import type { ComponentStatus } from '../../consumer';
import { BitIds, BitId } from '../../bit-id';
import type { PathOsBased } from '../../utils/path';
// TODO: should be change to the new component with the better API
import Component from '../../consumer/component';
import type { InvalidComponent } from '../../consumer/component/consumer-component';
import { ComponentWithDependencies } from '../../scope';
import ContextBitMap from './bit-map';
import ConsumerBitJson from '../../consumer/bit-json/consumer-bit-json';

export type WorkspaceProps = {
  consumer: Consumer,
  workspacePath: string,
  bitJson: ConsumerBitJson,
  bitMap: ContextBitMap
};

export default class Workspace {
  __consumer: Consumer;
  workspacePath: string;
  bitJson: ConsumerBitJson;
  bitMap: ContextBitMap;

  constructor(props: WorkspaceProps) {
    this.__consumer = props.consumer;
    this.workspacePath = props.workspacePath;
    this.bitJson = props.bitJson;
    this.bitMap = props.bitMap;
  }

  static async load(consumer: ?Consumer): Promise<?Workspace> {
    const loadedConsumer = consumer || (await loadConsumer());
    if (!consumer) {
      return null;
    }
    const props = {};
    props.consumer = loadedConsumer;
    props.workspacePath = consumer.getPath();
    // TODO: wrap bit json class with better API
    props.bitJson = consumer.bitJson;
    // TODO: wrap bit map class with better API
    props.bitMap = await ContextBitMap.load(consumer.bitMap);
    return new Workspace(props);
  }

  // TODO: write docs
  async loadComponents(
    ids: BitIds,
    throwOnFailure: boolean = true
  ): Promise<{ components: Component[], invalidComponents: InvalidComponent[] }> {
    // TODO: Make it return the new component type rather than consumer component
    // which is full of redundant stuff
    return this.__consumer.loadComponents(ids, throwOnFailure);
  }

  // TODO: write docs
  async importComponents(ids: BitId[], withAllVersions: boolean): Promise<ComponentWithDependencies[]> {
    // TODO: Make it return the new component type rather than consumer component
    return this.__consumer.importComponents(ids, withAllVersions);
  }

  async installExtension(id: BitId) {}

  /**
   * Get a component status by ID. Return a ComponentStatus object.
   * Keep in mind that a result can be a partial object of ComponentStatus, e.g. { notExist: true }.
   * Each one of the ComponentStatus properties can be undefined, true or false.
   * As a result, in order to check whether a component is not modified use (status.modified === false).
   * Don't use (!status.modified) because a component may not exist and the status.modified will be undefined.
   *
   * The status may have 'true' for several properties. For example, a component can be staged and modified at the
   * same time.
   *
   * The result is cached per ID and can be called several times with no penalties.
   */
  async getComponentStatus(id: BitId): Promise<ComponentStatus> {
    return this.__consumer.getComponentStatusById(id);
  }

  // TODO: re-think about it, maybe it's better to take it from the bitmap
  composeComponentPath(bitId: BitId): PathOsBased {
    return this.__consumer.composeComponentPath(bitId);
  }

  /**
   * delete files from fs according to imported/created
   * @param {BitIds} bitIds - list of remote component ids to delete
   * @param {boolean} deleteFiles - delete component files for authored
   */
  async removeComponentFromFs(bitIds: BitIds, deleteFiles: boolean) {
    return this.__consumer.removeComponentFromFs(bitIds, deleteFiles);
  }

  async ejectConf(componentId: BitId, opts: { ejectPath: ?string }) {
    return this.__consumer.ejectConf(componentId, opts);
  }

  async injectConf(componentId: BitId, opts: { force: boolean }) {
    return this.__consumer.ejectConf(componentId, opts.force);
  }

  // TODO: APIs to consider
  // async tag(id: BitId)
  // static async reset(projectPath: PathOsBasedAbsolute, resetHard: boolean, noGit: boolean = false)
}
