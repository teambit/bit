export type ScriptHandler = string | (() => void | Promise<void>);

export interface ScriptDefinition {
  name: string;
  handler: ScriptHandler;
}

export interface ScriptsMap {
  [scriptName: string]: ScriptHandler;
}
