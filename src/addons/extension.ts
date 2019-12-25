import { ExtensionAPI } from './extension-api';

export interface UserExtension {
  run: (api: ExtensionAPI) => Promise<void>;
  show?: (api: ExtensionAPI) => Promise<void>;
  defineDependencies?: (api: ExtensionAPI) => Promise<void>;
}

export class Extension {
  protected constructor() {}
}
