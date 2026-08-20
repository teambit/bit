// @bit-no-check
// @ts-nocheck
import { EnvsMain, EnvsAspect } from '@teambit/envs';
import get from 'lodash.get';

export class NodeEnv {
  static dependencies: any = [EnvsAspect];

  static async provider([envs]: [EnvsMain]) {
    // a minimal old-style (aspect based) env. deliberately not based on any non-core env, so
    // loading it from the scope installs only its own deps (lodash.get) into the scope-aspects
    // capsule. basing it on a real env would pull the entire env chain into the capsule, which
    // gets OOM-killed under yarn on CI (materialized as full copies, no store/hardlinks).
    // __getDescriptor is required for the env data of consuming components to be calculated
    const nodeEnv = {
      name: get({ envName: 'node-env-1' }, 'envName'),
      __getDescriptor: async () => ({ type: 'node-env-1' }),
    };
    envs.registerEnv(nodeEnv);
    return new NodeEnv();
  }
}
