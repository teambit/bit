import type { Command, CommandOptions } from '@teambit/cli';
import { BitError } from '@teambit/bit-error';
import { pathNormalizeToLinux } from '@teambit/toolbox.path.path';
import type { Component } from '../component';
import type { ComponentMain } from '../component.main.runtime';

const ENVS_ASPECT_ID = 'teambit.envs/envs';

type CatFlags = {
  file?: string;
  config: boolean;
  all: boolean;
  json: boolean;
};

export class CatCmd implements Command {
  name = 'cat <component-id>';
  description = 'print source files or config of a component at a specific version';
  group = 'info-analysis';
  alias = '';
  skipWorkspace = true;
  arguments = [
    {
      name: 'component-id',
      description: 'component ID, optionally with @version (e.g. scope/name@1.0.0)',
    },
  ];
  options = [
    ['f', 'file <path>', 'show only the specified file (relative to component root)'],
    ['c', 'config', 'show component configuration (env, dependencies) instead of source files'],
    ['a', 'all', 'show both source files and configuration'],
    ['j', 'json', 'output as JSON'],
  ] as CommandOptions;

  constructor(private component: ComponentMain) {}

  private async getComponent(idStr: string) {
    const host = this.component.getHost();
    if (!host) {
      throw new BitError(
        'unable to find a component host. please run this command from within a Bit workspace or scope'
      );
    }
    const id = await host.resolveComponentId(idStr);
    const component = await host.get(id);
    if (!component) {
      throw new BitError(`component "${idStr}" was not found`);
    }
    return component;
  }

  private getFiles(component: Component) {
    return component.state.filesystem.files.map((f) => ({
      path: f.relative,
      content: (f.contents as Buffer).toString('utf-8'),
    }));
  }

  private findFile(files: { path: string; content: string }[], filePath: string) {
    const normalized = pathNormalizeToLinux(filePath);
    const file = files.find((f) => f.path === normalized);
    if (!file) {
      const available = files.map((f) => f.path).join(', ');
      throw new BitError(`file "${filePath}" not found in component. available files: ${available}`);
    }
    return file;
  }

  private getConfig(component: Component) {
    const envsEntry = component.state.aspects.get(ENVS_ASPECT_ID);
    const env = envsEntry?.config?.env as string | undefined;

    const depsManifest = component.getDependencies().toDependenciesManifest();

    const config: Record<string, any> = {};
    if (env) config.env = env;
    if (Object.keys(depsManifest.dependencies || {}).length) config.dependencies = depsManifest.dependencies;
    if (Object.keys(depsManifest.devDependencies || {}).length) config.devDependencies = depsManifest.devDependencies;
    if (Object.keys(depsManifest.peerDependencies || {}).length)
      config.peerDependencies = depsManifest.peerDependencies;

    return config;
  }

  private formatFilesText(files: { path: string; content: string }[], singleFile?: string): string {
    if (singleFile) {
      return this.findFile(files, singleFile).content;
    }
    return files.map((f) => `--- ${f.path} ---\n${f.content}`).join('\n\n');
  }

  private formatConfigText(config: Record<string, any>): string {
    const lines: string[] = [];
    if (config.env) lines.push(`env: ${config.env}`);
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
      const deps = config[section];
      if (deps && Object.keys(deps).length) {
        lines.push(`${section}:`);
        for (const [pkg, ver] of Object.entries(deps)) {
          lines.push(`  ${pkg}: ${ver}`);
        }
      }
    }
    return lines.join('\n');
  }

  async report([idStr]: [string], flags: CatFlags) {
    if (flags.file && flags.config && !flags.all) {
      throw new BitError('--file cannot be used with --config. use --all to show both files and config');
    }
    const component = await this.getComponent(idStr);
    const showFiles = !flags.config || flags.all;
    const showConfig = flags.config || flags.all;
    const sections: string[] = [];

    if (showFiles) {
      const files = this.getFiles(component);
      sections.push(this.formatFilesText(files, flags.file));
    }
    if (showConfig) {
      const config = this.getConfig(component);
      sections.push(this.formatConfigText(config));
    }
    return sections.join('\n\n');
  }

  async json([idStr]: [string], flags: CatFlags) {
    if (flags.file && flags.config && !flags.all) {
      throw new BitError('--file cannot be used with --config. use --all to show both files and config');
    }
    const component = await this.getComponent(idStr);
    const showFiles = !flags.config || flags.all;
    const showConfig = flags.config || flags.all;

    const result: Record<string, any> = {
      id: component.id.toStringWithoutVersion(),
      version: component.id.version,
    };

    if (showFiles) {
      const allFiles = this.getFiles(component);
      result.files = flags.file ? [this.findFile(allFiles, flags.file)] : allFiles;
    }
    if (showConfig) {
      result.config = this.getConfig(component);
    }
    return result;
  }
}
