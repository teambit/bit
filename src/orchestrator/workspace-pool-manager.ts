import Pool from './resource-pool/pool';
import Resource, { ResourceEvents } from './resource-pool/resource';
import { ResourceFactory } from './resource-pool';
import ComponentDB from './db/component-db';

export default class WorkspacePoolManager<T> extends Pool<T> {
  constructor(
    readonly workspace: string,
    protected db: ComponentDB,
    protected resourceFactory: ResourceFactory<
      T
    > /*  memory: MemoryStore = redisSync(),
    logger: Logger,
    options: PoolOptions,
    private observer: Observer */
  ) {
    super(workspace, db, resourceFactory);
  }

  protected observeResource(resource: Resource<T>) {
    resource.on(ResourceEvents.Destroyed, () => {
      this.resourceDestroyed(resource);
    });

    resource.on(ResourceEvents.Idle, () => {
      resource.destroy();
      // this.logger.info(`[${this.name}] destroyed idle resource ${resource.id}`);
    });

    resource.on(ResourceEvents.Borrowed, () => {
      // const serializedResource = resource.serialize();
      // console.log('borrows', resource.id);
    });
  }
}
