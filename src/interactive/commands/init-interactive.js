/** @flow */
import inquirer from 'inquirer';
import { listScope } from '../../api/consumer';
import { init } from '../../api/consumer';

inquirer.registerPrompt('fuzzypath', require('inquirer-fuzzy-path'));

const finalResult = {};

async function askToSetupCompiler() {
  const ansShowBitCompilers = 'list compilers maintained by @bit team (bit list bit.envs --namespace compilers)';
  const ansShowCustomCompilers = 'list compilers from your own collection';

  const buildEnvQ = {
    type: 'list',
    name: 'buildEnv',
    message: 'setting up a default compiler for all components',
    choices: [ansShowBitCompilers, ansShowCustomCompilers, 'skip']
  };
  const { buildEnv } = await inquirer.prompt(buildEnvQ);
  if (buildEnv === ansShowBitCompilers) {
    await askBitsEnvs();
  } else if (buildEnv === ansShowCustomCompilers) {
    await askCustomEnvs();
  }
}

async function askBitsEnvs() {
  return askForRemoteCompiler('bit.envs');
}

async function askCustomEnvs() {
  const buildEnvScopeNameQ = {
    type: 'input',
    name: 'envsScope',
    message: 'enter your envs scope name'
  };
  const { envsScope } = await inquirer.prompt(buildEnvScopeNameQ);
  return askForRemoteCompiler(envsScope);
}

async function askForRemoteCompiler(scopeName) {
  const ids = await fetchComps(scopeName);
  const bitsEnvsQ = {
    type: 'list',
    name: 'compiler',
    message: 'choose your compiler',
    choices: ids
  };
  const { compiler } = await inquirer.prompt(bitsEnvsQ);
  finalResult.compiler = compiler;
  return compiler;
}

async function fetchComps(scopeName) {
  const listScopeResults = await listScope({ scopeName, showAll: false, showRemoteVersion: true });
  const ids = listScopeResults.map(result => result.id.toString());
  return ids;
}

async function askForPackageManager() {
  const buildEnvQ = {
    type: 'list',
    name: 'packageManager',
    message: 'Which is your default package manger',
    choices: ['npm', 'yarn']
  };
  const { packageManager } = await inquirer.prompt(buildEnvQ);
  finalResult.packageManager = packageManager;
}

async function askForComponentsDir() {
  // TODO: 1. the suggestOnly is the opposite, this is a bug in https://github.com/mokkabonna/inquirer-autocomplete-prompt/blob/master/index.js
  // TODO: 2. add option for the default ./components add support for adding extra values in (https://github.com/adelsz/inquirer-fuzzy-path)
  const componentsDirQ = {
    type: 'fuzzypath',
    name: 'componentsDir',
    excludePath: (nodePath) => {
      return nodePath.startsWith('node_modules') || nodePath.startsWith('.bit') || nodePath.startsWith('.git');
    },
    // excludePath :: (String) -> Bool
    // excludePath to exclude some paths from the file-system scan
    itemType: 'directory',
    // itemType :: 'any' | 'directory' | 'file'
    // specify the type of nodes to display
    // default value: 'any'
    // example: itemType: 'file' - hides directories from the item list
    rootPath: '.',
    // rootPath :: String
    // Root search directory
    message: 'Select a default imported components directory',
    default: 'components/{name}',
    suggestOnly: false
    // suggestOnly :: Bool
    // Restrict prompt answer to available choices or use them as suggestions
  };
  // return inquirer.prompt([

  // ]);
  const { componentsDir } = await inquirer.prompt([componentsDirQ]);
  if (componentsDir) {
    finalResult.componentsDefaultDirectory = componentsDir;
  }
}

export default (async function initInteractive() {
  const ui = new inquirer.ui.BottomBar();

  ui.log.write(`This utility initialize an empty Bit workspace and walks you through creating a bit.json file.
Run bit help json for full workspace configuration definition.

All configurations are reversible and overridable on per-command basis.

After setting up the workspace, use bit add to track components and modules.

Press ^C at any time to quit.`);

  await askToSetupCompiler();
  await askForPackageManager();
  await askForComponentsDir();
  return init(undefined, false, false, false, false, finalResult).then(
    ({ created, addedGitHooks, existingGitHooks }) => {
      return {
        created,
        addedGitHooks,
        existingGitHooks,
        reset: false,
        resetHard: false
      };
    }
  );
});
