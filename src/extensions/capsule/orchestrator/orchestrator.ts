import { Capsule, Exec } from '@teambit/capsule';
import { AnyFS } from '@teambit/any-fs';
import _ from 'lodash';
import sub from 'subleveldown';
import fs from 'fs-extra';
import level from 'level-party';
import levelMem from 'level-mem';
import { LevelUp } from 'levelup';
import { Resource } from './resource-pool';
import { Pool } from './resource-pool';
import Repository from './db/repository';
import { ComponentCapsule } from '../../capsule-ext';
import CapsuleFactory from './capsule-factory';
import BitContainerFactory from './bit-container-factory';
import { CreateOptions, ListResults } from './types';
import { Options } from '../capsule-builder';
import { getSync } from '../../../api/consumer/lib/global-config';
import { CFG_GLOBAL_REPOSITORY, REPOSITORY_CACHE_ROOT } from '../../../constants';
import { toBoolean } from '../../../utils';

export class CapsuleOrchestrator {
  private _loaded = false;

  constructor(
    private rootRepository: LevelUp,
    private db: Repository = new Repository(sub(rootRepository, 'orchestartor')),
    private pools: Pool<Capsule<Exec, AnyFS>>[] = []
  ) {}

  get loaded(): boolean {
    return this._loaded;
  }

  set loaded(value: boolean) {
    this._loaded = value;
  }

  private getPool(workspace: string): Pool<Capsule<Exec, AnyFS>> | undefined {
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

  async acquire(bitId: string, workspace?: string): Promise<Resource<Capsule<Exec, AnyFS>>> {
    if (!workspace) {
      const capsuleData = await Promise.all(this.pools.map(pool => pool.acquire(bitId)));
      return _.head(_.compact(capsuleData));
    }
    const pool = this.getPool(workspace);
    // @ts-ignore
    if (!pool) return Promise.resolve();
    return pool.acquire(bitId);
  }

  async getCapsule(workspace: string, capsuleConf: CreateOptions, options: Options): Promise<ComponentCapsule> {
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
  ): Promise<ComponentCapsule[] | ComponentCapsule> {
    let pool = this.getPool(workspace);
    if (!pool) {
      pool = await this.addPool(workspace);
    }
    return pool.getResources(capsuleConf, options.alwaysNew);
  }

  async addPool(workspace: string) {
    await this.db.put(workspace, '');
    const pool = new Pool<ComponentCapsule>(
      workspace,
      new Repository(sub(this.rootRepository, workspace)),
      new CapsuleFactory<ComponentCapsule>(
        new BitContainerFactory(),
        // @ts-ignore
        ComponentCapsule.create.bind(ComponentCapsule),
        ComponentCapsule.obtain.bind(ComponentCapsule)
      )
    );
    this.pools.push(pool);
    return pool;
  }

  async create(workspace: string, resourceId: string, options?: any): Promise<Resource<Capsule<Exec, AnyFS>>> {
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
      return new Pool<ComponentCapsule>(
        workspace,
        new Repository(sub(this.rootRepository, workspace)),
        new CapsuleFactory<ComponentCapsule>(
          new BitContainerFactory(),
          // TODO - FIX THIS ASAP
          // @ts-ignore
          ComponentCapsule.create.bind(ComponentCapsule),
          ComponentCapsule.obtain.bind(ComponentCapsule)
        )
      );
    });
    this.pools = pools;
    await Promise.all(this.pools.map(pool => pool.prune()));
    await this.prune();
    this.loaded = true;
  }

  static initiate(useInMemoryDB: boolean = toBoolean(getSync(CFG_GLOBAL_REPOSITORY), false)): CapsuleOrchestrator {
    const ROOT_REPOSITORY: LevelUp = useInMemoryDB ? levelMem() : level(REPOSITORY_CACHE_ROOT);
    return new CapsuleOrchestrator(ROOT_REPOSITORY);
  }
}
export default CapsuleOrchestrator.initiate();
