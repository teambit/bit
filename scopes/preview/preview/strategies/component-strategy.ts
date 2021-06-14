import { Compiler } from '@teambit/compiler';
import { ComponentMap } from '@teambit/component';
import { Capsule } from '@teambit/isolator';
import { AbstractVinyl } from '@teambit/legacy/dist/consumer/component/sources';
import { join } from 'path';
import { BuildContext } from '@teambit/builder';
import { Target, BundlerResult, BundlerContext } from '@teambit/bundler';
import fs from 'fs-extra';
import { BundlingStrategy } from '../bundling-strategy';
import { PreviewDefinition } from '../preview-definition';
import { PreviewTask } from '../preview.task';
import { normalizeMfName } from '../normalize-mf-name';
import { computeExposes } from '../compute-exposes';

export class ComponentBundlingStrategy implements BundlingStrategy {
  name = 'component';

  computeTargets(context: BuildContext, previewDefs: PreviewDefinition[]): Promise<Target[]> {
    return Promise.all(
      context.capsuleNetwork.seedersCapsules.map(async (capsule) => {
        const component = capsule.component;
        const entry = await this.writeEmptyEntryFile(capsule);
        const exposes = await this.computeExposes(capsule, previewDefs, context);
        return {
          entries: [entry],
          mfName: normalizeMfName(component.id.fullName),
          mfExposes: exposes,
          components: [component],
          outputPath: capsule.path,
        };
      })
    );
  }

  async computeExposes(
    capsule: Capsule,
    defs: PreviewDefinition[],
    context: BuildContext
  ): Promise<Record<string, string>> {
    return computeExposes(capsule.path, defs, capsule.component, context.env.getCompiler());
  }

  async writeEmptyEntryFile(capsule: Capsule): Promise<string> {
    const tempFolder = join(capsule.path, '__temp');
    await fs.ensureDir(tempFolder);
    const filePath = join(tempFolder, 'emptyFile.js');
    await fs.writeFile(filePath, '');
    return filePath;
  }

  async computeResults(context: BundlerContext, results: BundlerResult[], previewTask: PreviewTask) {
    return {
      componentsResults: results.map((result) => {
        return {
          errors: result.errors,
          component: result.components[0],
          warning: result.warnings,
        };
      }),
      artifacts: [{ name: 'preview', globPatterns: [previewTask.getPreviewDirectory(context)] }],
    };
  }

  getPathsFromMap(
    capsule: Capsule,
    moduleMap: ComponentMap<AbstractVinyl[]>,
    context: BuildContext
  ): ComponentMap<string[]> {
    const compiler: Compiler = context.env.getCompiler(context);
    return moduleMap.map((files) => {
      return files.map((file) => join(capsule.path, compiler.getDistPathBySrcPath(file.relative)));
    });
  }
}

// link-file.js
// new webpack.container.ModuleFederationPlugin({
//   exposes: {
//     // TODO: take the dist file programmatically
//     [`./${buttonId}`]: '/Users/giladshoham/Library/Caches/Bit/capsules/d3522af33785e04e8b1199864b9f46951ea3c008/my-scope_ui_button/dist/button.js',
//     [`./${buttonId}_composition_1`]: '/Users/giladshoham/Library/Caches/Bit/capsules/d3522af33785e04e8b1199864b9f46951ea3c008/my-scope_ui_button/dist/button.composition.js',
//     [`./${buttonId}_docs`]: '/Users/giladshoham/Library/Caches/Bit/capsules/d3522af33785e04e8b1199864b9f46951ea3c008/my-scope_ui_button/dist/button.docs.js',
//   },
// defaultEposes: './index'
// import ('uiButton')
// }),
