import fs from 'fs-extra';
import { EventEmitter } from 'events';
import ResourceFactory from './resource-factory';
import Resource, { ResourceEvents } from './resource';
import Repository from '../db/repository';
import { BitContainerConfig } from '../../capsule/container';
// eslint-disable-next-line import/no-named-as-default
import Logger, { Logger as LTYPE } from '../../logger/logger';
import { CreateOptions } from '../types';
import BitCapsule from '../../capsule/bit-capsule';

/* export enum Events {
  FactoryCreateErrors = 'factory-create-error',
  ResourceAvailable = 'resource-available'
} */

export type PoolOptions = {
  /**
   * number of concurrent resource creation processes.
   */
  concurrency: number;

  /**
   * labels
   */
  labels?: { [key: string]: string };
};

export default class Pool<T> extends EventEmitter {
  constructor(
    readonly workspace: string,
    protected db: Repository,
    protected resourceFactory: ResourceFactory<T>,
    protected logger: LTYPE = Logger,
    protected options: PoolOptions = { concurrency: 1 }
  ) {
    super();
  }

  async list(): Promise<any[]> {
    return this.db.keys();
  }
  /**
   * get the total number of pending
   */

  describe(resource: string) {
    return this.db.get(resource);
  }

  protected async resourceDestroyed(resource: Resource<T>) {
    this.logger.debug(`capsule ${resource.id} destroyed`);
    await this.db.del(resource.id);
  }

  public async createResource(resourceId: string, options: BitContainerConfig): Promise<Resource<T>> {
    const resource = await this.resourceFactory.create(options);
    await this.db.put(`${resourceId}`, resource.serialize());
    resource.id = resourceId;
    return resource;
  }

  protected observeResource(resource: Resource<T>) {
    resource.on(ResourceEvents.Destroyed, () => {
      this.resourceDestroyed(resource);
    });

    // TODO - remove this
    resource.on(ResourceEvents.Idle, () => {
      resource.destroy();
      // this.logger.info(`[${this.name}] destroyed idle resource ${resource.id}`);
    });

    resource.on(ResourceEvents.Borrowed, () => {
      // const serializedResource = resource.serialize();
      // console.log('borrows', resource.id);
    });
  }

  async getResources(
    capsuleWithConf: CreateOptions[] | CreateOptions,
    newCapsule = false
  ): Promise<BitCapsule[] | BitCapsule> {
    const create = async ({ resourceId, options }: CreateOptions): Promise<BitCapsule> => {
      let acquiredResource;
      let created = false;
      if (!newCapsule) {
        acquiredResource = await this.acquire(resourceId);
      }
      if (!acquiredResource) {
        acquiredResource = await this.createResource(resourceId, options);
        created = true;
      }
      this.observeResource(acquiredResource);
      const capsule = acquiredResource.use();
      capsule.new = created;
      return capsule;
    };

    if (Array.isArray(capsuleWithConf)) {
      return Promise.all(capsuleWithConf.map(async data => create(data)));
    }
    return create(capsuleWithConf);
  }

  async prune() {
    const allPoolCapsules = await this.db.getAll();
    await Promise.all(
      allPoolCapsules.map(async (data: { key: string; value: any }) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        if (!fs.existsSync(data.value.wrkDir!)) {
          await this.db.del(data.key);
        }
      })
    );
  }

  acquire(resourceId: string): Promise<Resource<T>> {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      const availableResource = await this.db.get(resourceId);
      if (!availableResource) return resolve();
      const resource = await this.resourceFactory.obtain(JSON.stringify(availableResource));
      resource.id = resourceId;
      return resolve(resource);
    });
  }
}
