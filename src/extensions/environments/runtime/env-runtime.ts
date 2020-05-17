import { RuntimeDef } from './runtime-def';

export class EnvRuntime {
  constructor(readonly defs: RuntimeDef[]) {}

  dev() {
    this.defs.forEach(def => def.dev());
  }
}
