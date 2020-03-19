import * as path from 'path';
import fs from 'fs-extra';
import CommandHelper from './e2e-command-helper';
import BitJsonHelper from './e2e-bit-json-helper';
import ScopesData from './e2e-scopes';
import FixtureHelper from './e2e-fixtures-helper';
import ScopeHelper from './e2e-scope-helper';
import FsHelper from './e2e-fs-helper';

export default class ExtensionsHelper {
  scopes: ScopesData;
  command: CommandHelper;
  bitJson: BitJsonHelper;
  scopeHelper: ScopeHelper;
  fixtures: FixtureHelper;
  fs: FsHelper;
  constructor(
    scopes: ScopesData,
    command: CommandHelper,
    bitJson: BitJsonHelper,
    scopeHelper: ScopeHelper,
    fixtures: FixtureHelper,
    fsHelper: FsHelper
  ) {
    this.scopes = scopes;
    this.command = command;
    this.bitJson = bitJson;
    this.scopeHelper = scopeHelper;
    this.fixtures = fixtures;
    this.fs = fsHelper;
  }

  importAndConfigureLegacyExtension(id: string) {
    this.command.importExtension(id);
    const bitJson = this.bitJson.read();
    bitJson.extensions = { [id]: { __legacy: true } };
    this.bitJson.write(bitJson);
  }

  addExtensionToWorkspaceConfig(extName: string, extConfig = {}) {
    const bitJson = this.bitJson.read();
    bitJson.extensions = bitJson.extensions || {};
    bitJson.extensions[extName] = extConfig;
    this.bitJson.write(bitJson);
  }

  createNewComponentExtension(name = 'foo-ext', content?: string, config?: any) {
    if (!content) {
      content = `
      module.exports = {
        name: 'eslint',
        dependencies: [],
        provider: async () => {
          console.log(\`hi there from an extension, got config: \${JSON.stringify()}\`)
        }
      };
      `;
    }
    this.fs.outputFile('foo-ext.js', content);
    this.command.addComponent('foo-ext.js', { i: name });
    this.addExtensionToWorkspaceConfig(name, config);
  }
}
