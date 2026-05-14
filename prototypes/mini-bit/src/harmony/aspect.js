// Aspect manifest. Pure declarative data — safe to import eagerly.
// The heavy code lives behind the `runtimes` thunks, loaded on demand.
export class Aspect {
  constructor(opts) {
    this.id = opts.id;
    this.dependencies = opts.dependencies || []; // Aspect[] — manifest-level
    this.runtimes = opts.runtimes || {};         // { [runtimeName]: () => import(...) }
  }
  static create(opts) {
    return new Aspect(opts);
  }
}
