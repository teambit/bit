import { resolve } from 'path';
import { Harmony, ExtensionManifest } from '../../../harmony';
import { ExtensionNotFound } from '../exceptions';
import { Script } from '../script';
import componentIdToPackageName from '../../../utils/bit/component-id-to-package-name';
import { BitId } from '../../../bit-id';

const DEFAULT_SCRIPT = 'default';

/**
 * the extension script registry.
 */
export class ScriptRegistry {
  constructor(
    /**
     * instance of harmony.
     */
    private harmony: Harmony<unknown>,

    /**
     * :TODO remove this ugly hack as well.
     */
    private defaultScope: string | null
  ) {}

  private scripts = {};

  /**
   * get a script from the registry.
   * @param token extension token.
   */
  get(token: string, name?: string) {
    const scripts = this.scripts[token];
    if (!scripts) throw new ExtensionNotFound();
    return this.scripts[token][name || DEFAULT_SCRIPT];
  }

  /**
   * set a script to the registry.
   */
  set(manifest: ExtensionManifest, modulePath: string, name?: string) {
    const extension = this.harmony.get(manifest.name);
    if (!extension) throw new ExtensionNotFound();
    if (!this.scripts[extension.name]) this.scripts[extension.name] = {};

    // :TODO fix this ugly hack
    let id = BitId.parse(extension.name);
    if (this.defaultScope) {
      id = BitId.parse(`${this.defaultScope}/${extension.name}`);
    }
    const packageName = componentIdToPackageName(id, '@bit');
    const path = resolve(`/${packageName}`, modulePath);

    this.scripts[extension.name][name || DEFAULT_SCRIPT] = Script.module(path, 'node');
    return this;
  }
}
