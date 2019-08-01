/** @flow */
import inquirer from 'inquirer';
import format from 'string-format';
import { init, listScope } from '../../api/consumer';

inquirer.registerPrompt('fuzzypath', require('inquirer-fuzzy-path'));

const TOP_MESSAGE = `This utility initialize an empty Bit workspace and walks you through creating a bit.json file.
Run bit help json for full workspace configuration definition.

All configurations are reversible and overridable on per-command basis.

After setting up the workspace, use bit add to track components and modules.

Press ^C at any time to quit.`;

function _generateEnvOriginQ(mode: 'compiler' | 'tester' = 'compiler', propName: string) {
  const ansShowBitEnvsTextTemplate = 'list {type} maintained by @bit team (bit list bit.envs --namespace {namespace})';
  const ansShowBitEnvsTextValues =
    mode === 'compiler' ? { type: 'compilers', namespace: 'compilers' } : { type: 'testers', namespace: 'testers' };
  const ansShowBitEnvsText = format(ansShowBitEnvsTextTemplate, ansShowBitEnvsTextValues);

  const ansShowBitEnvs = {
    name: ansShowBitEnvsText,
    value: 'bit.envs'
  };

  const ansShowCustomEnvsTextTemplate = 'list {type} from your own collection';
  const ansShowCustomEnvsTextValues = mode === 'compiler' ? { type: 'compilers' } : { type: 'testers' };
  const ansShowCustomEnvsText = format(ansShowCustomEnvsTextTemplate, ansShowCustomEnvsTextValues);

  const ansShowCustomEnvs = {
    name: ansShowCustomEnvsText,
    value: 'custom'
  };

  const mainTextTemplate = 'setting up a default {type} for all components';
  const mainTextValues = mode === 'compiler' ? { type: 'compilers' } : { type: 'testers' };
  const mainText = format(mainTextTemplate, mainTextValues);

  const envOriginQ = {
    type: 'list',
    name: propName,
    message: mainText,
    choices: [ansShowBitEnvs, ansShowCustomEnvs, 'skip']
  };

  return envOriginQ;
}

async function _generateEnvScopeNameQ(propName, originPropName) {
  const envScopeNameQ = {
    type: 'input',
    name: propName,
    message: 'enter your environment collection name',
    when: (answers) => {
      return answers[originPropName] === 'custom';
    }
  };
  return envScopeNameQ;
}

async function _generateRemoteEnvAutoCompleteQ(propName, message, customCollectionPropName, envOriginPropName) {
  const getEnvScopePropName = async (answers) => {
    const envScopePropName = answers[envOriginPropName] === 'bit.envs' ? envOriginPropName : customCollectionPropName;
    return Promise.resolve(envScopePropName);
  };
  const when = (answers) => {
    return answers[envOriginPropName] !== 'skip';
  };
  return _generateRemoteComponentAutoComplete(propName, message, when, {
    ansPropName: getEnvScopePropName
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
  const buildEnvOriginQ = _generateEnvOriginQ('compiler', 'buildEnvOrigin');
  const buildEnvCollectionNameQ = await _generateEnvScopeNameQ('compilerCollectionName', 'buildEnvOrigin');
  const buildEnvNameQ = await _generateRemoteEnvAutoCompleteQ(
    'compiler',
    'choose your compiler',
    'compilerCollectionName',
    'buildEnvOrigin'
  );
  const testEnvOriginQ = _generateEnvOriginQ('tester', 'testEnvOrigin');
  const testEnvCollectionNameQ = await _generateEnvScopeNameQ('testerCollectionName', 'testEnvOrigin');
  const testEnvNameQ = await _generateRemoteEnvAutoCompleteQ(
    'tester',
    'choose your tester',
    'testerCollectionName',
    'testEnvOrigin'
  );
  return [
    componentsDirQ,
    packageManagerQ,
    buildEnvOriginQ,
    buildEnvCollectionNameQ,
    buildEnvNameQ,
    testEnvOriginQ,
    testEnvCollectionNameQ,
    testEnvNameQ
  ];
}

export default (async function initInteractive() {
  const ui = new inquirer.ui.BottomBar();

  ui.log.write(TOP_MESSAGE);
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
