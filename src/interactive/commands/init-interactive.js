/** @flow */
import inquirer from 'inquirer';
import { init, listScope } from '../../api/consumer';

inquirer.registerPrompt('fuzzypath', require('inquirer-fuzzy-path'));

function _generateBuildEnvOriginQ() {
  const ansShowBitCompilers = {
    name: 'list compilers maintained by @bit team (bit list bit.envs --namespace compilers)',
    value: 'bit.envs'
  };

  const ansShowCustomCompilers = {
    name: 'list compilers from your own collection',
    value: 'custom'
  };

  const buildEnvOriginQ = {
    type: 'list',
    name: 'buildEnvOrigin',
    message: 'setting up a default compiler for all components',
    choices: [ansShowBitCompilers, ansShowCustomCompilers, 'skip']
  };

  return buildEnvOriginQ;
}

async function _generateBuildEnvScopeNameQ(propName) {
  const buildEnvScopeNameQ = {
    type: 'input',
    name: propName,
    message: 'enter your environment collection name',
    when: (answers) => {
      return answers.buildEnvOrigin === 'custom';
    }
  };
  return buildEnvScopeNameQ;
}

async function _generateRemoteCompilerAutoCompleteQ(customCollectionPropName) {
  const getCompilerScopePropName = async (answers) => {
    const propName = answers.buildEnvOrigin === 'bit.envs' ? 'buildEnvOrigin' : customCollectionPropName;
    return Promise.resolve(propName);
  };
  const when = (answers) => {
    return answers.buildEnvOrigin !== 'skip';
  };
  return _generateRemoteComponentAutoComplete('compiler', 'choose your compiler', when, {
    ansPropName: getCompilerScopePropName
  });
}

async function _fetchComps(scopeName) {
  const listScopeResults = await listScope({ scopeName, showAll: false, showRemoteVersion: true });
  const ids = listScopeResults.map(result => result.id.toString());
  return ids;
}

async function _generateRemoteComponentAutoComplete(
  name,
  message,
  when,
  { scopeName, ansPropName }: { scopeName?: string, ansPropName: string | Function }
) {
  const components = scopeName ? await _fetchComps(scopeName) : null;
  let choices = components;
  if (!choices) {
    // Used to build from previous answered question
    choices = async (answers) => {
      let propName = ansPropName;
      if (typeof ansPropName === 'function') {
        propName = await ansPropName(answers);
      }
      return _fetchComps(answers[propName]);
    };
  }

  const selectComponent = {
    type: 'list',
    name,
    message,
    when,
    choices
  };

  return selectComponent;
}

async function _buildQuestions() {
  const packageManagerQ = {
    type: 'list',
    name: 'packageManager',
    message: 'Which is your default package manger',
    choices: ['npm', 'yarn']
  };

  // TODO: 1. the suggestOnly is the opposite, this is a bug in https://github.com/mokkabonna/inquirer-autocomplete-prompt/blob/master/index.js
  // TODO: 2. add option for the default ./components add support for adding extra values in (https://github.com/adelsz/inquirer-fuzzy-path)
  const componentsDirQ = {
    type: 'fuzzypath',
    name: 'componentsDefaultDirectory',
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
  const buildEnvOriginQ = _generateBuildEnvOriginQ();
  const buildEnvCollectionNameQ = await _generateBuildEnvScopeNameQ('compilerCollectionName');
  const buildEnvNameQ = await _generateRemoteCompilerAutoCompleteQ('compilerCollectionName');
  return [componentsDirQ, packageManagerQ, buildEnvOriginQ, buildEnvCollectionNameQ, buildEnvNameQ];
}

export default (async function initInteractive() {
  const ui = new inquirer.ui.BottomBar();

  ui.log.write(`This utility initialize an empty Bit workspace and walks you through creating a bit.json file.
Run bit help json for full workspace configuration definition.

All configurations are reversible and overridable on per-command basis.

After setting up the workspace, use bit add to track components and modules.

Press ^C at any time to quit.`);

  // await askToSetupCompiler();
  // await askForPackageManager();
  // await askForComponentsDir();
  const questions = await _buildQuestions();
  const answers = await inquirer.prompt(questions);

  return init(undefined, false, false, false, false, answers).then(({ created, addedGitHooks, existingGitHooks }) => {
    return {
      created,
      addedGitHooks,
      existingGitHooks,
      reset: false,
      resetHard: false
    };
  });
});
