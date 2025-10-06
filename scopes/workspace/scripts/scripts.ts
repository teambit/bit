import type { ScriptHandler, ScriptsMap } from './script-definition';

export class Scripts {
  constructor(private scriptsMap: ScriptsMap) {}

  static from(scripts: ScriptsMap): Scripts {
    return new Scripts(scripts);
  }

  get(name: string): ScriptHandler | undefined {
    return this.scriptsMap[name];
  }

  has(name: string): boolean {
    return name in this.scriptsMap;
  }

  list(): string[] {
    return Object.keys(this.scriptsMap);
  }

  getAll(): ScriptsMap {
    return this.scriptsMap;
  }

  isEmpty(): boolean {
    return this.list().length === 0;
  }
}
