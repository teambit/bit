// @bit-no-check
// @ts-nocheck
import { EnvsMain, EnvsAspect } from '@teambit/envs';
import flatten from 'lodash.flatten';

export class NodeEnv {
  static dependencies: any = [EnvsAspect];

  static async provider([envs]: [EnvsMain]) {
    // a minimal old-style (aspect based) env. deliberately not based on any non-core env, so
    // loading it from the scope installs only its own deps (lodash.flatten) into the scope-aspects
    // capsule. basing it on a real env would pull the entire env chain into the capsule, which
    // gets OOM-killed under yarn on CI (materialized as full copies, no store/hardlinks).
    // __getDescriptor is required for the env data of consuming components to be calculated
    const nodeEnv = {
      name: flatten([['node-env-2']])[0],
      __getDescriptor: async () => ({ type: 'node-env-2' }),
    };
    envs.registerEnv(nodeEnv);
    return new NodeEnv();
  }
}
