import chalk from 'chalk';
import inquirer from 'inquirer';
import format from 'string-format';

import { init, listScope } from '../../api/consumer';
import logger from '../../logger/logger';

inquirer.registerPrompt('fuzzypath', require('inquirer-fuzzy-path'));

type ENVS_TYPE = 'compiler' | 'tester';

export const TOP_MESSAGE = `This utility initialize an empty Bit workspace and walks you through creating a bit configuration.
You can later edit your configuration in your package.json or bit.json.
Press ^C at any time to quit.

After setting up the workspace, use 'bit add' to track components and modules.`;

export const PACKAGE_MANAGER_MSG_Q = 'Which package manager would you like to use for installing components?';
export const DEFAULT_DIR_MSG_Q = 'Where would you like to store imported components?';
export const CHOOSE_ENV_MSG_TEMPLATE_Q = 'Which {type} would you like to use for the components?';
export const CHOOSE_CUSTOM_ENV_MSG_TEMPLATE_Q =
  'Paste the "bit import" command for the {type} (press "enter" to skip).';
export const CHOOSE_COMPILER_MSG_Q = format(CHOOSE_ENV_MSG_TEMPLATE_Q, { type: 'compiler' });
// export const CHOOSE_TESTER_MSG_Q = format(CHOOSE_ENV_MSG_TEMPLATE_Q, { type: 'tester' });
export const CHOOSE_CUSTOM_COMPILER_MSG_Q = format(CHOOSE_CUSTOM_ENV_MSG_TEMPLATE_Q, { type: 'compiler' });
const SKIP_DEFINE_ENV_TEMPLATE_ANS = 'no {type}';
const SKIP_DEFINE_COMPILER_ANS = format(SKIP_DEFINE_ENV_TEMPLATE_ANS, { type: 'compiler' });
// const SKIP_DEFINE_TESTER_ANS = format(SKIP_DEFINE_ENV_TEMPLATE_ANS, { type: 'tester' });
const CUSTOM_ENV_TEMPLATE_ANS = 'I have my own {type}';
const CUSTOM_COMPILER_ANS = format(CUSTOM_ENV_TEMPLATE_ANS, { type: 'compiler' });
// const CUSTOM_TESTER_ANS = format(CUSTOM_ENV_TEMPLATE_ANS, { type: 'tester' });
const SKIP_CUSTOM_ENV_KEYWORD = 'skip';
const BIT_ENVS_SCOPE_NAME = 'bit.envs';
const CUSTOM_COMPILER_PROP_NAME = 'custom-compiler';
const DEFAULT_LOCATION_DIR = 'components';
const DEFAULT_LOCATION_NOTE = "(bit's default location)";
const DEFAULT_LOCATION_ANS = `${DEFAULT_LOCATION_DIR} ${DEFAULT_LOCATION_NOTE}`;

function _generateChooseEnvQ(
  envType: ENVS_TYPE,
  propName: string,
  message: string,
  skipAnsTxt: string,
  customEnvAnsTxt: string
) {
  let components: string[] = [];
  // Fetch the components from the remote. If there was an error or no components returned we will skip the question.
  // We will store the returned components in a higher scope, to prevent another request during the choices calculation
  const whenWithFetch = async () => {
    try {
      components = await _fetchEnvs(envType);
      if (!components || !components.length) {
        // eslint-disable-next-line no-console
        console.log(chalk.yellow('no components found. skipping question'));
        return false;
      }
      return true;
    } catch (e) {
      // eslint-disable-next-line no-console
      //  console.log(
      //  chalk.yellow(`could not retrieve compilers list.
      // see full error log in ${DEBUG_LOG}
      // you can add a compiler later using bit import [compiler-name] --${envType}`)
      //      );
      logger.info(e);
      return true;
    }
  };

  const choices = () => {
    const choicesArr = [skipAnsTxt, new inquirer.Separator()];
    if (components && components.length) {
      choicesArr.push(...components);
      choicesArr.push(new inquirer.Separator());
    }
    choicesArr.push(customEnvAnsTxt);
    choicesArr.push(new inquirer.Separator());
    return choicesArr;
  };

  const selectEnv = {
    type: 'list',
    name: propName,
    message,
    when: whenWithFetch,
    choices,
  };

  return selectEnv;
}

function _generateChooseCustomEnvQ(
  envType: ENVS_TYPE,
  propName: string,
  message: string,
  propToCheck: string,
  valToCheck: string
) {
  const when = (answers) => {
    return answers[propToCheck] === valToCheck;
  };
  const customEnv = {
    type: 'input',
    name: propName,
    message,
    when,
  };

  return customEnv;
}

async function _fetchEnvs(envType: ENVS_TYPE) {
  if (envType === 'compiler') {
    return _fetchCompilers();
  }
  return _fetchTesters();
}

async function _fetchCompilers() {
  return _fetchComps(BIT_ENVS_SCOPE_NAME, ['compilers', 'bundlers']);
}

async function _fetchTesters() {
  return _fetchComps(BIT_ENVS_SCOPE_NAME, ['testers']);
}

async function _fetchComps(scopeName: string, namespaces: string[] = []) {
  // Filter the namespace on the remote
  const namespacesUsingWildcards = namespaces.length ? `${namespaces.join('|')}/*` : undefined;
  // Not using user/pass strategy since it will interrupt the flow
  const strategiesNames = ['token', 'ssh-agent', 'ssh-key'];

  const listScopeResults = await listScope({
    scopeName,
    showAll: false,
    showRemoteVersion: true,
    namespacesUsingWildcards,
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    strategiesNames,
  });
  const ids = listScopeResults.map((result) => result.id.toString());
  return ids;
}

async function _buildQuestions() {
  const packageManagerQ = {
    type: 'list',
    name: 'packageManager',
    message: PACKAGE_MANAGER_MSG_Q,
    choices: ['npm', 'yarn'],
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
    message: DEFAULT_DIR_MSG_Q,
    default: DEFAULT_LOCATION_ANS,
    suggestOnly: false,
    // suggestOnly :: Bool
    // Restrict prompt answer to available choices or use them as suggestions
  };

  const chooseCompilerQ = _generateChooseEnvQ(
    'compiler',
    'compiler',
    CHOOSE_COMPILER_MSG_Q,
    SKIP_DEFINE_COMPILER_ANS,
    CUSTOM_COMPILER_ANS
  );
  const chooseCustomCompilerQ = _generateChooseCustomEnvQ(
    'compiler',
    CUSTOM_COMPILER_PROP_NAME,
    CHOOSE_CUSTOM_COMPILER_MSG_Q,
    'compiler',
    CUSTOM_COMPILER_ANS
  );

  return [packageManagerQ, componentsDirQ, chooseCompilerQ, chooseCustomCompilerQ];
}

export default (async function initInteractive() {
  const ui = new inquirer.ui.BottomBar();

  ui.log.write(TOP_MESSAGE);
  const questions = await _buildQuestions();
  const answers = await inquirer.prompt(questions);
  if (answers.componentsDefaultDirectory === DEFAULT_LOCATION_ANS) {
    // Remove the default location note
    answers.componentsDefaultDirectory = DEFAULT_LOCATION_DIR;
  }
  answers.componentsDefaultDirectory = `${answers.componentsDefaultDirectory}/{name}`;
  let actualCompiler = answers.compiler;
  if (actualCompiler === CUSTOM_COMPILER_ANS) {
    actualCompiler = answers[CUSTOM_COMPILER_PROP_NAME];
    if (actualCompiler.startsWith('bit import')) {
      // remove bit import copied from the bit.dev
      actualCompiler = actualCompiler.replace('bit import ', '');
    }
    if (actualCompiler.toLowerCase() === SKIP_CUSTOM_ENV_KEYWORD) {
      actualCompiler = undefined;
    }
  } else if (actualCompiler === SKIP_DEFINE_COMPILER_ANS) {
    actualCompiler = undefined;
  }
  answers.compiler = actualCompiler;
  return init(undefined, false, false, false, false, false, answers).then(
    ({ created, addedGitHooks, existingGitHooks }) => {
      return {
        created,
        addedGitHooks,
        existingGitHooks,
        reset: false,
        resetHard: false,
      };
    }
  );
});
