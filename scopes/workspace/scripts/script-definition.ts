import type { Component } from '@teambit/component';

export interface ScriptExecuteContext {
  components: Component[];
}

export type ScriptHandler = string | ((context?: ScriptExecuteContext) => void | Promise<void>);

export interface ScriptDefinition {
  name: string;
  handler: ScriptHandler;
}

export interface ScriptsMap {
  [scriptName: string]: ScriptHandler;
}
