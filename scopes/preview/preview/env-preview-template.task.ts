import { BuildContext, BuiltTaskResult, BuildTask, TaskLocation, ComponentResult } from '@teambit/builder';
import { Component, ComponentMap } from '@teambit/component';
import { Bundler, BundlerContext, BundlerResult, Target } from '@teambit/bundler';
import { EnvsMain } from '@teambit/envs';
import { join } from 'path';
import { compact } from 'lodash';
import { existsSync, mkdirpSync } from 'fs-extra';
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
        const capsule = context.capsuleNetwork.graphCapsules.getCapsule(envComponent.id);
        if (!capsule) throw new Error('no capsule found');
        const previewRoot = await this.preview.writePreviewRuntime(context);
        const previewModules = await this.getPreviewModules(envComponent);
        const templatesFile = previewModules.map((template) => {
          return this.preview.writeLink(template.name, ComponentMap.create([]), template.path, capsule.path);
        });
        const outputPath = this.computeOutputPath(context, envComponent);
        if (!existsSync(outputPath)) mkdirpSync(outputPath);

        // const entries = this.getEntries(
        //   previewModules.concat({
        //     name: 'main',
        //     path: previewRoot,
        //   })
        // );

        return {
          entries: templatesFile.concat(previewRoot),
          components: [envComponent],
          outputPath,
          // modules: [module],
        };
      })
    );

    const bundlerContext: BundlerContext = Object.assign({}, context, {
      targets,
      entry: [],
      externalizePeer: false,
      development: context.dev,
    });

    const bundler: Bundler = await context.env.getBundler(bundlerContext, []);
    const bundlerResults = await bundler.run();
    const results = await this.computeResults(bundlerContext, bundlerResults);
    return results;
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

  async computeResults(context: BundlerContext, results: BundlerResult[]) {
    const result = results[0];

    const componentsResults: ComponentResult[] = result.components.map((component) => {
      return {
        component,
        errors: result.errors.map((err) => (typeof err === 'string' ? err : err.message)),
        warning: result.warnings,
        startTime: result.startTime,
        endTime: result.endTime,
      };
    });

    const artifacts = this.getArtifactDef();

    return {
      componentsResults,
      artifacts,
    };
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

  private getArtifactDirectory() {
    return `__bit__env-template`;
  }

  private computeOutputPath(context: BuildContext, component: Component) {
    const capsule = context.capsuleNetwork.graphCapsules.getCapsule(component.id);
    if (!capsule) throw new Error('no capsule found');
    return join(capsule.path, this.getArtifactDirectory());
  }

  private getArtifactDef() {
    return [
      {
        name: 'env-template',
        globPatterns: [`${this.getArtifactDirectory()}/**`],
        // rootDir,
        // context: env,
      },
    ];
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
