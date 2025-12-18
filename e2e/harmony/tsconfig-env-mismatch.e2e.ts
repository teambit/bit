import chai, { expect } from 'chai';
import { Helper } from '@teambit/legacy.e2e-helper';
import chaiFs from 'chai-fs';
import chaiString from 'chai-string';

chai.use(chaiFs);
chai.use(chaiString);

/**
 * This test verifies that components are compiled with their own env's tsconfig settings,
 * even when imported by components using a different env with different tsconfig.
 *
 * Scenario:
 * - A "theme" component uses a custom permissive env (no strict mode in tsconfig)
 * - A "consumer" component uses a custom strict env (strict: true in tsconfig)
 * - Consumer imports/depends on the theme component
 * - Theme has TypeScript code that passes permissive but fails strict mode
 *
 * Expected behavior:
 * - `bit check-types` should pass (uses component's own tsconfig via TsServer)
 * - `bit build` should also pass (each component compiled with its own env's tsconfig
 *   via proper project references in tsconfig.json)
 *
 * This test requires the typescript-compiler fix that uses `network.graphCapsules` instead
 * of `network.getCapsulesToCompile()` to include cross-env dependencies in project references.
 * See: https://bit.cloud/teambit/typescript/~change-requests/fix-cross-env-tsconfig-references
 */
describe('tsconfig env mismatch between check-types and build', function () {
  this.timeout(0);
  let helper: Helper;

  before(() => {
    helper = new Helper();
  });

  after(() => {
    helper.scopeHelper.destroy();
  });

  describe('component with permissive tsconfig imported by env with strict tsconfig', () => {
    before(() => {
      helper.scopeHelper.setWorkspaceWithRemoteScope();

      // Create permissive tsconfig (no strict mode)
      const permissiveTsconfig = JSON.stringify(
        {
          compilerOptions: {
            lib: ['es2019', 'DOM', 'ES6', 'DOM.Iterable'],
            target: 'es2015',
            module: 'commonjs',
            jsx: 'react',
            declaration: true,
            sourceMap: true,
            skipLibCheck: true,
            moduleResolution: 'node',
            esModuleInterop: true,
            outDir: './dist',
            // No strict mode - permissive
          },
          exclude: ['artifacts', 'public', 'dist', 'node_modules'],
        },
        null,
        2
      );

      // Create strict tsconfig (strict: true)
      const strictTsconfig = JSON.stringify(
        {
          compilerOptions: {
            lib: ['es2019', 'DOM', 'ES6', 'DOM.Iterable'],
            target: 'es2015',
            module: 'commonjs',
            jsx: 'react',
            declaration: true,
            sourceMap: true,
            skipLibCheck: true,
            moduleResolution: 'node',
            esModuleInterop: true,
            outDir: './dist',
            strict: true, // Strict mode enabled
          },
          exclude: ['artifacts', 'public', 'dist', 'node_modules'],
        },
        null,
        2
      );

      // Create permissive-env (no strict mode)
      const permissiveEnvCode = `import { TypescriptCompiler, TypescriptTask } from '@teambit/typescript.typescript-compiler';
import { Pipeline } from '@teambit/builder';

export class PermissiveEnv {
  name = 'permissive-env';

  compiler() {
    return TypescriptCompiler.from({
      tsconfig: require.resolve('./config/tsconfig.json'),
    });
  }

  build() {
    return Pipeline.from([
      TypescriptTask.from({
        tsconfig: require.resolve('./config/tsconfig.json'),
      }),
    ]);
  }
}

export default new PermissiveEnv();
`;
      helper.fs.outputFile('permissive-env/permissive-env.bit-env.ts', permissiveEnvCode);
      helper.fs.outputFile('permissive-env/index.ts', `export { PermissiveEnv } from './permissive-env.bit-env';`);
      helper.fs.outputFile('permissive-env/config/tsconfig.json', permissiveTsconfig);
      helper.command.addComponent('permissive-env');
      helper.command.setEnv('permissive-env', 'teambit.envs/env');

      // Create strict-env (strict: true)
      const strictEnvCode = `import { TypescriptCompiler, TypescriptTask } from '@teambit/typescript.typescript-compiler';
import { Pipeline } from '@teambit/builder';

export class StrictEnv {
  name = 'strict-env';

  compiler() {
    return TypescriptCompiler.from({
      tsconfig: require.resolve('./config/tsconfig.json'),
    });
  }

  build() {
    return Pipeline.from([
      TypescriptTask.from({
        tsconfig: require.resolve('./config/tsconfig.json'),
      }),
    ]);
  }
}

export default new StrictEnv();
`;
      helper.fs.outputFile('strict-env/strict-env.bit-env.ts', strictEnvCode);
      helper.fs.outputFile('strict-env/index.ts', `export { StrictEnv } from './strict-env.bit-env';`);
      helper.fs.outputFile('strict-env/config/tsconfig.json', strictTsconfig);
      helper.command.addComponent('strict-env');
      helper.command.setEnv('strict-env', 'teambit.envs/env');

      // Create theme component with code that passes permissive but fails strict mode
      // Using strictNullChecks pattern - accessing property on potentially null value
      const themeCode = `export type ThemeMode = 'light' | 'dark';

export interface ThemeSchema {
  primaryColor: string;
  backgroundColor: string;
}

export const darkThemeSchema: ThemeSchema = {
  primaryColor: '#000000',
  backgroundColor: '#1a1a1a',
};

// This function may return null
function getThemeInternal(): ThemeSchema | null {
  return null;
}

// This fails strictNullChecks: Object is possibly 'null' (TS18047/TS2531)
export function getThemePrimaryColor(): string {
  const theme = getThemeInternal();
  return theme.primaryColor; // Error in strict mode: theme is possibly null
}

export function getTheme(mode: ThemeMode): ThemeSchema {
  return darkThemeSchema;
}
`;
      helper.fs.outputFile('theme/index.ts', themeCode);
      helper.command.addComponent('theme');
      helper.command.setEnv('theme', 'permissive-env');

      // Create consumer component that imports theme
      // This component uses strict-env which has strict: true in tsconfig
      const consumerCode = `import { getTheme } from '@${helper.scopes.remote}/theme';

export function getDefaultTheme() {
  return getTheme('light');
}
`;
      helper.fs.outputFile('consumer/index.ts', consumerCode);
      helper.command.addComponent('consumer');
      helper.command.setEnv('consumer', 'strict-env');

      helper.command.link();
      helper.command.install('@teambit/typescript.typescript-compiler @teambit/builder');
      helper.command.compile();
    });

    it('bit check-types should pass without strict mode errors', () => {
      const output = helper.general.runWithTryCatch('bit check-types --unmodified');
      expect(output).to.not.have.string('TS18047');
      expect(output).to.not.have.string('TS2531');
      expect(output).to.not.have.string('TS7053');
      expect(output).to.not.have.string("possibly 'null'");
    });

    it('bit build should pass without strict mode errors (each component uses its own tsconfig)', () => {
      // This test verifies the fix: each component should be compiled with its own env's tsconfig.
      // Theme component uses permissive-env (no strict), consumer uses strict-env (strict).
      // With proper project references, TypeScript respects each component's tsconfig settings.
      //
      // Before the fix (typescript-compiler using getCapsulesToCompile):
      // - Build failed with TS18047: 'theme' is possibly 'null'
      // - Theme was type-checked with strict-env's strict tsconfig
      //
      // After the fix (typescript-compiler using graphCapsules):
      // - Build passes because theme uses its own permissive-env's tsconfig
      const output = helper.general.runWithTryCatch('bit build');
      // Should NOT have any strict mode errors
      expect(output).to.not.have.string('TS18047');
      expect(output).to.not.have.string('TS2531');
      expect(output).to.not.have.string('TS7053');
      expect(output).to.not.have.string("possibly 'null'");
    });
  });
});
