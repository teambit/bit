/** @flow */
import inquirer from 'inquirer';
import { listScope } from '../../api/consumer';

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

export default (async function initInteractive() {
  const ui = new inquirer.ui.BottomBar();

  ui.log.write(`This utility initialize an empty Bit workspace and walks you through creating a bit.json file.
Run bit help json for full workspace configuration definition.

All configurations are reversible and overridable on per-command basis.

After setting up the workspace, use bit add to track components and modules.

Press ^C at any time to quit.`);

  await askToSetupCompiler();
  await askForPackageManager();
});
