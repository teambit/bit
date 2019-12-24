import { Capsule, Exec, Volume } from 'capsule';
import _ from 'lodash';
import hash from 'object-hash';
import { Resource } from './resource-pool';
import AbortablePromise from '../utils/abortable-promise';
import { Pool } from './resource-pool';
import { ComponentDB } from './db/component-db';
import { PoolNotFound } from './exceptions';
import WorkspacePoolManager from './workspace-pool-manager';
import { BitCapsule } from '../capsule';
import CapsuleFactory from './capsule-factory';
import BitContainerFactory from './bit-container-factory';

export class CapsuleOrchestrator {
  constructor(private db: ComponentDB, private pools: Pool<Capsule<Exec, Volume>>[] = []) {}
  private getPool(workspace: string): Pool<Capsule<Exec, Volume>> | undefined {
    return this.pools.find(pool => pool.workspace === workspace);
  }

  async list(workspace?: string) {
    const x = await Promise.all(this.pools.map(pool => pool.list()));
    return x;
  }

  acquire(workspace: string, bitId: string): AbortablePromise<Resource<Capsule<Exec, Volume>>> {
    const pool = this.getPool(workspace);
    // @ts-ignore
    if (!pool) return Promise.resolve();
    return pool.acquire(bitId);
  }

  create(workspace: string, resourceId: string, options?: any): Promise<Resource<Capsule<Exec, Volume>>> {
    let pool = this.getPool(workspace);
    if (!pool) {
      // add workspace to pool
      pool = new WorkspacePoolManager<BitCapsule>(
        workspace,
        new ComponentDB(workspace),
        new CapsuleFactory<BitCapsule>(
          new BitContainerFactory(),
          // @ts-ignore
          BitCapsule.create.bind(BitCapsule),
          BitCapsule.obtain.bind(BitCapsule)
        )
      );
      this.pools.push(pool);
    }

    return pool.createResource(resourceId, options);
  }
  drain() {
    return Promise.resolve();
  }

  async buildPools() {
    const keys = await this.db.keys();

    const pools = keys.map(workspace => {
      return new WorkspacePoolManager<BitCapsule>(
        workspace,
        new ComponentDB(workspace),
        new CapsuleFactory<BitCapsule>(
          new BitContainerFactory(),
          // TODO - FIX THIS ASAP
          // @ts-ignore
          BitCapsule.create.bind(BitCapsule),
          BitCapsule.obtain.bind(BitCapsule)
        )
      );
    });
    this.pools = pools;
  }
  static initiate(): CapsuleOrchestrator {
    const orchDb = new ComponentDB();

    return new CapsuleOrchestrator(orchDb);
  }
}
export default CapsuleOrchestrator.initiate();
