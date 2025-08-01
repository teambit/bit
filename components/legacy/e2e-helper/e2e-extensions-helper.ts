import type WorkspaceJsoncHelper from './e2e-workspace-jsonc-helper';
import type CommandHelper from './e2e-command-helper';
import type FixtureHelper from './e2e-fixtures-helper';
import type FsHelper from './e2e-fs-helper';
import type ScopeHelper from './e2e-scope-helper';
import type ScopesData from './e2e-scopes';

export default class ExtensionsHelper {
  scopes: ScopesData;
  command: CommandHelper;
  workspaceJsonc: WorkspaceJsoncHelper;
  scopeHelper: ScopeHelper;
  fixtures: FixtureHelper;
  fs: FsHelper;
  constructor(
    scopes: ScopesData,
    command: CommandHelper,
    workspaceJsonc: WorkspaceJsoncHelper,
    scopeHelper: ScopeHelper,
    fixtures: FixtureHelper,
    fsHelper: FsHelper
  ) {
    this.scopes = scopes;
    this.command = command;
    this.workspaceJsonc = workspaceJsonc;
    this.scopeHelper = scopeHelper;
    this.fixtures = fixtures;
    this.fs = fsHelper;
  }

  addExtensionToWorkspace(extName: string, extConfig = {}) {
    this.workspaceJsonc.addKeyVal(extName, extConfig);
  }

  addExtensionToVariant(variant: string, extName: string, extConfig = {}, replaceExisting = false) {
    this.workspaceJsonc.addToVariant(variant, extName, extConfig, replaceExisting);
  }

  removeAllExtensionsFromVariant(variant: string) {
    this.workspaceJsonc.setVariant(this.scopes.localPath, variant, {});
  }

  /**
   * This will set the extension as the only extension of the variant
   * If you want to add new one, use addExtensionToVariant
   *
   * @param {string} variant
   * @param {string} extName
   * @param {*} [extConfig={}]
   * @memberof ExtensionsHelper
   */
  setExtensionToVariant(variant: string, extName: string, extConfig = {}) {
    this.removeAllExtensionsFromVariant(variant);
    this.addExtensionToVariant(variant, extName, extConfig);
  }

  createNewComponentExtension(name = 'foo-ext', content?: string, config?: any) {
    if (!content) {
      content = `
      module.exports = {
        name: 'eslint',
        dependencies: [],
        provider: async () => {
          console.log(\`hi there from an extension\`)
        }
      };
      `;
    }
    this.fs.outputFile('foo-ext.js', content);
    this.command.addComponent('foo-ext.js', { i: name });
    this.addExtensionToWorkspace(name, config);
  }
}
