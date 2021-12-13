import { BuildContext, BuiltTaskResult, BuildTask, TaskLocation } from '@teambit/builder';
import { Component } from '@teambit/component';
import { Bundler, BundlerContext, Target } from '@teambit/bundler';
import { EnvsMain } from '@teambit/envs';
import { compact } from 'lodash';
import { PreviewMain } from './preview.main.runtime';

export type ModuleExpose = {
  name: string;
  path: string;
};

export class EnvPreviewTemplateTask implements BuildTask {
  aspectId = 'teambit.preview/preview';
  name = 'GenerateEnvTemplate';
  location: TaskLocation = 'end';

  constructor(private preview: PreviewMain, private envs: EnvsMain) {}

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const envComponents = context.components.filter((component) => this.envs.getEnvFromComponent(component));
    if (!envComponents.length) return { componentsResults: [] };
    const targets: Target[] = await Promise.all(
      envComponents.map(async (envComponent) => {
        // const module = await this.getPreviewModule(envComponent);
        // const entries = Object.keys(module).map((key) => module.exposes[key]);
        const previewRoot = await this.preview.writePreviewRuntime(context);
        const previewModules = await this.getPreviewModules(envComponent);
        const entries = this.getEntries(
          previewModules.concat({
            name: 'main',
            path: previewRoot,
          })
        );

        return {
          entries,
          development: true,
          // externalizePeer: true,
          components: [envComponent],
          outputPath: this.computeOutputPath(context, envComponent),
          // modules: [module],
        };
      })
    );

    const bundlerContext: BundlerContext = Object.assign({}, context, {
      targets,
      entry: [],
    });

    const bundler: Bundler = await context.env.getBundler(bundlerContext, []);
    const bundlerResults = await bundler.run();

    return {
      componentsResults: [],
    };
  }

  getEntries(previewModules: ModuleExpose[]): { [key: string]: string } {
    const entriesArr = previewModules.map((module) => {
      return {
        import: module.path,
        library: {
          name: module.name,
          type: 'umd',
        },
      };
    });

    return entriesArr.reduce((entriesMap, entry) => {
      entriesMap[entry.library.name] = entry;
      return entriesMap;
    }, {});
  }

  async getPreviewModules(envComponent: Component): Promise<ModuleExpose[]> {
    const env = this.envs.getEnv(envComponent);
    const previewDefs = this.preview.getDefs();
    const modules = compact(
      await Promise.all(
        previewDefs.map(async (def) => {
          if (!def.renderTemplatePathByEnv) return undefined;
          return {
            name: def.prefix,
            path: await def.renderTemplatePathByEnv(env.env),
          };
        })
      )
    );

    return modules;
  }

  private computeOutputPath(context: BuildContext, component: Component) {
    const capsule = context.capsuleNetwork.graphCapsules.getCapsule(component.id);
    return `${capsule?.path}`;
  }

  // private async getPreviewModule(envComponent: Component): Promise<ModuleTarget> {
  //   const env = this.envs.getEnv(envComponent);
  //   const previewDefs = this.preview.getDefs();
  //   const modules = compact(await Promise.all(previewDefs.map(async (def) => {
  //     if (!def.renderTemplatePathByEnv) return undefined;
  //     return [def.prefix, await def.renderTemplatePathByEnv(env.env)];
  //   })));

  //   const exposes = modules.reduce((exposesAcc, [prefix, path]) => {
  //     const internalPath = `./${prefix}`;
  //     exposesAcc[internalPath] = path;
  //     return exposesAcc;
  //   }, {});

  //   return {
  //     component: envComponent,
  //     exposes
  //   };
  // }
}
