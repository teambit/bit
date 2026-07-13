import findRoot from 'find-root';
import type {
  DependenciesEnv,
  PackageEnv,
  PreviewEnv,
  BuilderEnv,
  DevEnv,
  CompilerEnv,
  LinterEnv,
  FormatterEnv,
  TesterEnv,
  EnvContext,
} from '@teambit/envs';
import type { EnvPolicyConfigObject } from '@teambit/dependency-resolver';
import type { Compiler } from '@teambit/compiler';
import type { Tester } from '@teambit/tester';
import type { Linter } from '@teambit/linter';
import type { Formatter } from '@teambit/formatter';
import type { SchemaExtractor } from '@teambit/schema';
import type { Bundler, BundlerContext, DevServer, DevServerContext } from '@teambit/bundler';
import type { BuildTask } from '@teambit/builder';
import { Pipeline } from '@teambit/builder';
import type { PackageJsonProps } from '@teambit/pkg';
import { PackageGenerator } from '@teambit/pkg';
import type { EnvPreviewConfig } from '@teambit/preview';
import {
  TypescriptCompiler,
  TypescriptTask,
  resolveTypes,
  GLOBAL_TYPES_DIR,
} from '@teambit/typescript.typescript-compiler';
import { TypeScriptExtractor } from '@teambit/typescript';
import { OxlintLinter } from '@teambit/oxc.linter.oxlint-linter';
import { PrettierFormatter } from '@teambit/defender.prettier-formatter';
import { ReactPreview as RspackReactPreview } from '@teambit/rspack.dev-services.preview.react-preview';
import { rspackTransformer } from './config/rspack.config';

export const NodeEnvType = 'node';

/**
 * The build-task classes exported (ESM-only) by `@teambit/vite.vitest-tester`.
 * They are pre-loaded by the aspect provider via the esm-loader and injected here, so the
 * CJS core aspect can use them synchronously.
 */
export type VitestModule = {
  VitestTester: { from: (options: { config: string }) => (context: EnvContext) => Tester };
  VitestTask: { from: (options: { config: string }) => any };
};

/**
 * A slim Node environment.
 *
 * Unlike the legacy implementation (which delegated its whole toolchain to the heavy
 * `@teambit/react` aspect — webpack + jest + eslint), this env uses the modern
 * `EnvHandler`-based toolchain: the typescript-compiler, vitest tester, oxlint linter and an
 * rspack-based preview. Output stays CommonJS (no `esm`/`type: module`) so it remains a drop-in
 * for the default env and its many consumers; only the toolchain was slimmed.
 *
 * It is authored in the OLD (aspect) env model so it can be registered by the core
 * `teambit.harmony/node` aspect, but each service method delegates to the new `EnvHandler`
 * factories — mirroring exactly what the env-service `transform`s do for a `*.bit-env.ts` env.
 */
export class NodeEnv
  implements
    DependenciesEnv,
    PackageEnv,
    PreviewEnv,
    BuilderEnv,
    DevEnv,
    CompilerEnv,
    LinterEnv,
    FormatterEnv,
    TesterEnv
{
  name = 'node';

  type = NodeEnvType;

  icon = 'https://static.bit.dev/extensions-icons/nodejs.svg';

  private VitestTester: VitestModule['VitestTester'];

  private VitestTask: VitestModule['VitestTask'];

  constructor(
    /** shared env-handler context, created once by the provider */
    private envContext: EnvContext,
    /** the ESM-only vitest tester/task classes, pre-loaded by the provider */
    vitest: VitestModule
  ) {
    this.VitestTester = vitest.VitestTester;
    this.VitestTask = vitest.VitestTask;
  }

  private get tsconfigPath(): string {
    return require.resolve('./config/tsconfig.json');
  }

  private get vitestConfigPath(): string {
    return require.resolve('./config/vitest.config.mjs');
  }

  private get oxlintConfigPath(): string {
    return require.resolve('./config/oxlintrc.json');
  }

  private get prettierConfigPath(): string {
    return require.resolve('./config/prettier.config.cjs');
  }

  private cachedPreview?: RspackReactPreview;

  private get types(): string[] {
    const packageRoot = findRoot(require.resolve('@teambit/typescript.typescript-compiler'));
    return [...resolveTypes(__dirname, ['./types']), ...resolveTypes(packageRoot, [GLOBAL_TYPES_DIR])];
  }

  /**
   * lazily create (and memoize) the rspack react-preview instance, then delegate every legacy
   * preview method to it — exactly like `PreviewService.transform` / `DevServerService.transform`.
   */
  private get preview(): RspackReactPreview {
    if (!this.cachedPreview) {
      this.cachedPreview = RspackReactPreview.from({
        previewConfig: {
          splitComponentBundle: false,
          strategyName: 'component',
        },
        transformers: [rspackTransformer],
      })(this.envContext);
    }
    return this.cachedPreview;
  }

  getDependencies(): EnvPolicyConfigObject {
    return {
      peers: [
        {
          name: 'react',
          version: '^19.0.0',
          supportedRange: '^17.0.0 || ^18.0.0 || ^19.0.0',
        },
        {
          name: 'react-dom',
          version: '^19.0.0',
          supportedRange: '^17.0.0 || ^18.0.0 || ^19.0.0',
        },
        {
          name: 'vite',
          version: '^8.0.0',
          supportedRange: '^8.0.0',
        },
        {
          name: 'vitest',
          version: '^4.1.0',
          supportedRange: '^4.1.0',
        },
        {
          name: '@types/node',
          version: '22.13.14',
          supportedRange: '^22.13.14',
        },
        {
          name: '@rspack/core',
          version: '^1.7.9',
          supportedRange: '^1.7.9',
        },
      ],
      dev: [],
    };
  }

  getCompiler(): Compiler {
    return TypescriptCompiler.from({
      tsconfig: this.tsconfigPath,
      types: this.types,
    })(this.envContext);
  }

  getBuildPipe(): BuildTask[] {
    return Pipeline.from([
      TypescriptTask.from({
        tsconfig: this.tsconfigPath,
        types: this.types,
      }),
      this.VitestTask.from({
        config: this.vitestConfigPath,
      }),
    ]).compute(this.envContext);
  }

  getTester(): Tester {
    return this.VitestTester.from({
      config: this.vitestConfigPath,
    })(this.envContext);
  }

  getLinter(): Linter {
    return OxlintLinter.from({
      binDir: __dirname,
      oxlintNodeOptions: {
        configPath: this.oxlintConfigPath,
        tsconfigPath: this.tsconfigPath,
        typeAware: true,
      },
    })(this.envContext);
  }

  getFormatter(): Formatter {
    return PrettierFormatter.from({
      configPath: this.prettierConfigPath,
    })(this.envContext);
  }

  getSchemaExtractor(): SchemaExtractor {
    return TypeScriptExtractor.from({
      tsconfig: this.tsconfigPath,
    })(this.envContext);
  }

  getPackageJsonProps(): PackageJsonProps {
    return this.packageGenerator.packageJsonProps;
  }

  getNpmIgnore(): string[] {
    return this.packageGenerator.npmIgnore;
  }

  private get packageGenerator(): PackageGenerator {
    return PackageGenerator.from({
      packageJson: {
        main: 'dist/{main}.js',
        types: '{main}.ts',
      },
    })(this.envContext);
  }

  // --- preview / dev-server delegations (mirror Preview/DevServer service transforms) ---

  getMounter(): string {
    return this.preview.getMounter();
  }

  getDocsTemplate(): string {
    return this.preview.getDocsTemplate();
  }

  getPreviewConfig(): EnvPreviewConfig {
    return this.preview.getPreviewConfig();
  }

  getAdditionalHostDependencies(): string[] {
    return this.preview.getHostDependencies();
  }

  async getBundler(context: BundlerContext): Promise<Bundler> {
    return this.preview.getBundler(context)(this.envContext);
  }

  async getTemplateBundler(context: BundlerContext): Promise<Bundler> {
    return this.preview.getTemplateBundler(context)(this.envContext);
  }

  getDevServer(context: DevServerContext): DevServer | Promise<DevServer> {
    return this.preview.getDevServer(context)(this.envContext);
  }

  getDevEnvId(): string {
    return this.preview.getDevEnvId();
  }

  async __getDescriptor() {
    return {
      type: NodeEnvType,
    };
  }
}
