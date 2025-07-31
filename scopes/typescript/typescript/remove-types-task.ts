import { PackageJsonFile } from '@teambit/component.sources';
import type { BuildContext, BuildTask, BuiltTaskResult } from '@teambit/builder';
import { TypescriptAspect } from './typescript.aspect';

export class RemoveTypesTask implements BuildTask {
  readonly aspectId = TypescriptAspect.id;
  readonly name = 'RemoveTypesProp';
  readonly description = 'remove the types prop from package.json';
  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    await this.removeTypesFromPkgJson(context);

    const result = {
      componentsResults: [],
    };

    return result;
  }

  /**
   * the types['index.ts'] is needed only during the build to avoid errors when tsc finds the
   * same type once in the d.ts and once in the ts file.
   */
  private async removeTypesFromPkgJson(context: BuildContext) {
    if (context.env?.getPackageJsonProps && typeof context.env.getPackageJsonProps === 'function') {
      const propsFromEnv = context.env.getPackageJsonProps();
      // in case the env has its own "types" prop and it's not the "types" automatically added to the source in order
      // to to avoid build error, then keep it.
      if (propsFromEnv.types !== '{main}.ts') {
        return;
      }
    }
    await Promise.all(
      context.capsuleNetwork.seedersCapsules.map(async (capsule) => {
        const packageJson = PackageJsonFile.loadFromCapsuleSync(capsule.path);
        // the reason for `packageJson.packageJsonObject.main` is that .d.ts components don't have a main file and they
        // do need the types prop
        if (packageJson.packageJsonObject.types && packageJson.packageJsonObject.main) {
          delete packageJson.packageJsonObject.types;
          await packageJson.write();
        }
      })
    );
  }
}
