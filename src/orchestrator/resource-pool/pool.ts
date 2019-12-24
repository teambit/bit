import { EventEmitter } from 'events';
import ResourceFactory from './resource-factory';
import Resource from './resource';
import AbortablePromise from '../../utils/abortable-promise';
import ComponentDB from '../db/component-db';
import { BitContainerConfig } from '../../capsule/container';

export enum Events {
  FactoryCreateErrors = 'factory-create-error',
  ResourceAvailable = 'resource-available'
}

export type PoolOptions = {
  /**
   * minimum number of resources
   */
  // min: number;

  /**
   * maximum number of resources.
   */
  // max?: number;

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
    protected db: ComponentDB,
    protected resourceFactory: ResourceFactory<T>,
    // protected logger: Logger,
    protected options: PoolOptions = { concurrency: 1 }
  ) {
    super();
  }

  async list(): Promise<any[]> {
    const x = await this.db.keys();
    return x;
  }
  /**
   * get the total number of pending
   */
  getOptions(): PoolOptions {
    return this.options;
  }

  protected async resourceDestroyed(resource: Resource<T>) {
    // const serialized = resource.serialize();
    // console.log('resource destroyed', resource.id);
  }

  public async createResource(resourceId: string, options: BitContainerConfig): Promise<Resource<T>> {
    const resource = await this.resourceFactory.create(options);

    await this.db.put(`${resourceId}`, resource.serialize());
    return resource;
  }

  acquire(resourceId: string): AbortablePromise<Resource<T>> {
    return new AbortablePromise(
      async resolve => {
        const availableResource = await this.db.get(resourceId);
        // @ts-ignore
        if (!availableResource) return resolve();
        // const availableResource = map[this.workspace][resourceId];
        const resource = await this.resourceFactory.obtain(JSON.stringify(availableResource));
        // this.logger.debug(`obtained resource ${resource.id}`);
        return resolve(resource);
      },
      () => ''
    );
  }
}
