import { Capsule, Exec, Volume } from 'capsule';
import _ from 'lodash';
import sub from 'subleveldown';
import fs from 'fs-extra';
import level from 'level-party';
import { LevelUp } from 'levelup';
import { Resource } from './resource-pool';
import { Pool } from './resource-pool';
import Repository from './db/repository';
import { BitCapsule } from '../capsule';
import CapsuleFactory from './capsule-factory';
import BitContainerFactory from './bit-container-factory';
import { CreateOptions, ListResults } from './types';
import { Options } from '../environment/capsule-builder';
import { getSync } from '../api/consumer/lib/global-config';
import { CFG_GLOBAL_REPOSITORY, REPOSITORY_CACHE_ROOT } from '../constants';

export class CapsuleOrchestrator {
  private _loaded = false;

  constructor(
    private rootRepository: LevelUp,
    private db: Repository = new Repository(sub(rootRepository, 'orchestartor')),
    private pools: Pool<Capsule<Exec, Volume>>[] = []
  ) {}

  get loaded(): boolean {
    return this._loaded;
  }

  set loaded(value: boolean) {
    this._loaded = value;
  }

  private getPool(workspace: string): Pool<Capsule<Exec, Volume>> | undefined {
    return this.pools.find(pool => pool.workspace === workspace);
  }

  async describe(capsule: string): Promise<any> {
    const capsuleData = await Promise.all(this.pools.map(pool => pool.describe(capsule)));
    return _.head(_.compact(capsuleData));
  }

  async list(workspace?: string): Promise<ListResults[] | ListResults> {
    if (workspace) {
      const pool = this.getPool(workspace);
      if (!pool) throw new Error(`No workspace ${workspace}`);
      const capsules = await pool.list();
      return {
        workspace,
        capsules
      };
    }
    const data = await Promise.all(
      this.pools.map(async pool => {
        const capsules = await pool.list();
        return {
          workspace: pool.workspace,
          capsules
        };
      })
    );
    return data;
  }

  acquire(workspace: string, bitId: string): Promise<Resource<Capsule<Exec, Volume>>> {
    const pool = this.getPool(workspace);
    // @ts-ignore
    if (!pool) return Promise.resolve();
    return pool.acquire(bitId);
  }
  async getCapsule(workspace: string, capsuleConf: CreateOptions, options: Options): Promise<BitCapsule> {
    let pool = this.getPool(workspace);
    if (!pool) {
      pool = await this.addPool(workspace);
    }
    return pool.getResource(capsuleConf, options.alwaysNew);
  }

  async getCapsules(
    workspace: string,
    capsuleConf: CreateOptions[] | CreateOptions,
    options: Options
  ): Promise<BitCapsule[] | BitCapsule> {
    let pool = this.getPool(workspace);
    if (!pool) {
      pool = await this.addPool(workspace);
    }
    return pool.getResources(capsuleConf, options.alwaysNew);
  }

  async addPool(workspace: string) {
    await this.db.put(workspace, '');
    const pool = new Pool<BitCapsule>(
      workspace,
      new Repository(sub(this.rootRepository, workspace)),
      new CapsuleFactory<BitCapsule>(
        new BitContainerFactory(),
        // @ts-ignore
        BitCapsule.create.bind(BitCapsule),
        BitCapsule.obtain.bind(BitCapsule)
      )
    );
    this.pools.push(pool);
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

  async prune() {
    const keys: string[] = await this.db.keys();
    await Promise.all(
      // eslint-disable-next-line consistent-return
      keys.map(async workspace => {
        if (!fs.pathExistsSync(workspace)) {
          return this.db.del(workspace);
        }
      })
    );
  }

  async buildPools() {
    const keys: string[] = await this.db.keys();
    const pools = keys.map(workspace => {
      return new Pool<BitCapsule>(
        workspace,
        new Repository(sub(this.rootRepository, workspace)),
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
    await Promise.all(this.pools.map(pool => pool.prune()));
    await this.prune();
    this.loaded = true;
  }

  static initiate(): CapsuleOrchestrator | undefined {
    const shouldInitOrchestrator = getSync(CFG_GLOBAL_REPOSITORY) || true;
    if (!shouldInitOrchestrator) return;
    const ROOT_REPOSITORY: LevelUp = level(REPOSITORY_CACHE_ROOT);
    // eslint-disable-next-line consistent-return
    return new CapsuleOrchestrator(ROOT_REPOSITORY);
  }
}
export default CapsuleOrchestrator.initiate();
