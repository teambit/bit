// @flow
import path from 'path';
import fs from 'fs-extra';
import CommandHelper from './e2e-command-helper';
import BitJsonHelper from './e2e-bit-json-helper';
import ScopesData from './e2e-scopes';

export default class ExtensionsHelper {
  scopes: ScopesData;
  command: CommandHelper;
  bitJson: BitJsonHelper;
  constructor(scopes: ScopesData, command: CommandHelper, bitJson: BitJsonHelper) {
    this.scopes = scopes;
    this.command = command;
    this.bitJson = bitJson;
  }

  importAndConfigureExtension(id: string) {
    this.command.importExtension(id);
    const bitJson = this.bitJson.read();
    // $FlowFixMe
    bitJson.extensions = { [id]: {} };
    this.bitJson.write(bitJson);
  }

  importNpmPackExtension(id: string = 'bit.extensions/npm/pack@2.0.1') {
    this.importAndConfigureExtension(id);
    // workaround to get the registry into the package.json file
    const extensionFilePath = path.join(
      this.scopes.localPath,
      '.bit/components/npm/pack/bit.extensions/2.0.1/index.js'
    );
    const extensionFile = fs.readFileSync(extensionFilePath).toString();
    const extensionFileIncludeRegistry = extensionFile.replace(
      'excludeRegistryPrefix: true',
      'excludeRegistryPrefix: false'
    );
    const extensionFileWithJsonOutput = extensionFileIncludeRegistry.replace(
      'return result;',
      'return JSON.stringify(result, null, 2);'
    );
    fs.writeFileSync(extensionFilePath, extensionFileWithJsonOutput);
  }
}
