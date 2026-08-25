import { ReactEnv } from '@teambit/react.react-env';

/**
 * A react env for the react (UI) components of the bit repo. Identical to
 * teambit.react/react-env (rspack preview, jest tester, oxlint), except for the
 * tsconfig: it relaxes `noImplicitAny` and `strictPropertyInitialization` — the
 * same relaxations core-aspect-env and the node envs use.
 *
 * Why this is load-bearing: during capsule builds, every bit env points the
 * build-shape package.json `types` at SOURCE `.ts` files. The env's tsc program
 * therefore follows imports (including type-only chains through published
 * packages' d.ts files, e.g. `@teambit/component-descriptor` -> `@teambit/component`)
 * into OTHER capsules' sources and type-checks them with THIS env's
 * compilerOptions. Those foreign sources (core aspects, node-env components)
 * are written under the relaxed rules, so a full-strict react env fails the
 * build of any component whose type-space reaches them. Aligning the tsconfig
 * with the rest of the network makes the cross-env checking harmless.
 */
export class CoreReactEnv extends ReactEnv {
  name = 'core-react-env';

  protected tsconfigPath = require.resolve('./config/tsconfig.json');
}

export default new CoreReactEnv();
