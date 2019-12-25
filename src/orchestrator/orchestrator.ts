import { Capsule, Exec, Volume } from 'capsule';
import path from 'path';
import fs from 'fs-extra';
import { Resource } from './resource-pool';
import { Pool } from './resource-pool';
import ComponentDB from './db/component-db';
import WorkspacePoolManager from './workspace-pool-manager';
import { BitCapsule } from '../capsule';
import CapsuleFactory from './capsule-factory';
import BitContainerFactory from './bit-container-factory';
import { COMPONENT_CACHE_ROOT } from '../constants';

export class CapsuleOrchestrator {
  private _loaded = false;

  constructor(private pools: Pool<Capsule<Exec, Volume>>[] = []) {}

  get loaded(): boolean {
    return this._loaded;
  }

  set loaded(value: boolean) {
    this._loaded = value;
  }

  private getPool(workspace: string): Pool<Capsule<Exec, Volume>> | undefined {
    return this.pools.find(pool => pool.workspace === workspace);
  }

  /* async list(workspace?: string) {
    // const x = await Promise.all(this.pools.map(pool => pool.list()));
    // return x;
  } */

  acquire(workspace: string, bitId: string): Promise<Resource<Capsule<Exec, Volume>>> {
    const pool = this.getPool(workspace);
    // @ts-ignore
    if (!pool) return Promise.resolve();
    return pool.acquire(bitId);
  }

  async getCapsules(
    workspace: string,
    bitIdsWithData: { resourceId: string; options: any }[],
    globalOptions = { new: false }
  ) {
    let pool = this.getPool(workspace);
    if (!pool) {
      pool = await this.addPool(workspace);
    }
    return pool.getResources(bitIdsWithData, globalOptions);
  }

  async addPool(workspace: string) {
    const pool = new WorkspacePoolManager<BitCapsule>(
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
    // await this.db.put(workspace, hash(workspace));
    return pool;
  }

  async create(workspace: string, resourceId: string, options?: any): Promise<Resource<Capsule<Exec, Volume>>> {
    let pool = this.getPool(workspace);
    if (!pool) {
      pool = await this.addPool(workspace);
    }
    return pool.createResource(resourceId, options);
  }
  drain() {
    return Promise.resolve();
  }

  async buildPools() {
    const keys: string[] = fs.readdirSync(COMPONENT_CACHE_ROOT);

    const pools = keys.map(workspace => {
      workspace = workspace.split('_').join(path.sep);
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
    this.loaded = true;
  }

  static initiate(): CapsuleOrchestrator {
    return new CapsuleOrchestrator();
  }
}
export default CapsuleOrchestrator.initiate();
