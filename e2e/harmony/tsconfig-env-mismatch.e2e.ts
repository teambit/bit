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
 * - A "theme" component uses react-env (permissive tsconfig, no strict mode)
 * - A "custom-env" component uses aspect env (strict tsconfig with `strict: true`)
 * - Custom-env imports/depends on the theme component
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

// This fails strictNullChecks: Object is possibly 'null' (TS2531)
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
      helper.command.setEnv('theme', 'teambit.react/react');

      // Create custom-env that imports theme component
      // This env uses aspect env which has strict: true in tsconfig
      const customEnvCode = `import { getTheme } from '@${helper.scopes.remote}/theme';

export class MyCustomEnv {
  name = 'my-custom-env';

  getDefaultTheme() {
    return getTheme('light');
  }
}

export default new MyCustomEnv();
`;
      helper.fs.outputFile('custom-env/custom-env.bit-env.ts', customEnvCode);
      helper.fs.outputFile('custom-env/index.ts', `export { MyCustomEnv } from './custom-env.bit-env';`);
      helper.command.addComponent('custom-env');
      helper.command.setEnv('custom-env', 'teambit.harmony/aspect');

      helper.command.link();
      helper.command.install();
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
      // Theme component uses react-env (no strict), custom-env uses aspect-env (strict).
      // With proper project references, TypeScript respects each component's tsconfig settings.
      //
      // Before the fix (typescript-compiler using getCapsulesToCompile):
      // - Build failed with TS18047: 'theme' is possibly 'null'
      // - Theme was type-checked with aspect-env's strict tsconfig
      //
      // After the fix (typescript-compiler using graphCapsules):
      // - Build passes because theme uses its own react-env's permissive tsconfig
      const output = helper.general.runWithTryCatch('bit build');
      // Should NOT have any strict mode errors
      expect(output).to.not.have.string('TS18047');
      expect(output).to.not.have.string('TS2531');
      expect(output).to.not.have.string('TS7053');
      expect(output).to.not.have.string("possibly 'null'");
    });
  });
});
