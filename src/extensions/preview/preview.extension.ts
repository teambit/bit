import { writeFileSync } from 'fs';
import { resolve, join } from 'path';
import { generateLink } from './generate-link';
import { ComponentMap } from '../component/component-map';
import { BundlerExtension } from '../bundler';

export class PreviewExtension {
  static dependencies = [BundlerExtension];

  /**
   * write a link for a loading custom modules dynamically.
   * @param prefix write
   * @param moduleMap map of components to module paths to require.
   * @param defaultModule
   */
  writeLink(prefix: string, moduleMap: ComponentMap<string[]>, defaultModule?: string) {
    const contents = generateLink(prefix, moduleMap, defaultModule);
    // :TODO @uri please generate a random file in a temporary directory
    const targetPath = resolve(join(__dirname, `/__${prefix}-${Date.now()}.js`));
    writeFileSync(targetPath, contents);

    return targetPath;
  }

  static async provider([bundler]: [BundlerExtension]) {
    bundler.registerTarget({
      entry: async () => [require.resolve('./preview.runtime')],
    });

    return new PreviewExtension();
  }
}
