import { writeFileSync } from 'fs';
import { resolve, join } from 'path';
import { generateLink } from './generate-link';
import { ComponentMap } from '../component/component-map';
import { BundlerExtension } from '../bundler';
import { BuilderExtension } from '../builder';
import { PreviewTask } from './preview.task';
import { UIExtension } from '../ui';

export class PreviewExtension {
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

  static dependencies = [BundlerExtension, BuilderExtension, UIExtension];

  static async provider([bundler, builder, ui]: [BundlerExtension, BuilderExtension, UIExtension]) {
    bundler.registerTarget({
      entry: async () => [require.resolve('./preview.runtime')],
    });

    builder.registerTask(new PreviewTask(bundler, ui.getUiRootOrThrow('@teambit/workspace')));

    return new PreviewExtension();
  }
}
