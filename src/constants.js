/** @flow */
import cliSpinners from 'cli-spinners';
import os from 'os';
import path from 'path';

const userHome = require('user-home');
const packageFile = require('../package.json');

const isWindows = os.platform() === 'win32';

function getDirectory(): string {
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'Bit');
  }

  return path.join(userHome, '.bit');
}

function getCacheDirectory(): string {
  if (process.platform === 'darwin') {
    return path.join(userHome, 'Library', 'Caches', 'Bit');
  }

  return getDirectory();
}

export const RESOURCES = path.resolve(path.join(__dirname, '../resources'));

export const BIT_DESCRIPTION = 'bit is a free and open source tool designed for easy use, maintenance and discovery of code components.';

export const BIT_USAGE = '[--version] [--help] <command> [<args>]';

export const BITS_DIRNAME = 'components';

export const INLINE_BITS_DIRNAME = 'inline_components';

export const BIT_JSON = 'bit.json';

export const REMOTE_ALIAS_SIGN = '@';

export const DEFAULT_IMPL_NAME = 'impl.js';

export const DEFAULT_SPECS_NAME = 'spec.js';

export const NO_PLUGIN_TYPE = 'none';

export const DEFAULT_COMPILER_ID = NO_PLUGIN_TYPE;

export const DEFAULT_TESTER_ID = NO_PLUGIN_TYPE;

export const DEFAULT_DIST_DIRNAME = 'dist';

export const DEFAULT_BUNDLE_FILENAME = 'dist.js';

export const DEFAULT_BIT_VERSION = 1;

export const DEFAULT_LANGUAGE = 'javascript';

export const LATEST_BIT_VERSION = 'latest';

export const OBJECTS_DIR = 'objects';

export const NULL_BYTE = '\u0000';

export const SPACE_DELIMITER = ' ';

export const DEFAULT_BOX_NAME = 'global';

export const VERSION_DELIMITER = '::';

export const DEPENDENCY_MAP_FILENAME = 'dependencies.json';

export const BIT_EXTERNAL_DIRNAME = 'external';

export const LOCAL_SCOPE_NOTATION = '@this';

export const DEFAULT_REMOTES = {};

export const DEFAULT_DEPENDENCIES = {};

export const SPINNER_TYPE = isWindows ? cliSpinners.line : cliSpinners.dots12;

export const DEFAULT_HUB_DOMAIN = 'hub.bitsrc.io';

export const SEARCH_DOMAIN = 'api.bitsrc.io';

export const DEFAULT_SSH_KEY_FILE = `${userHome}/.ssh/id_rsa`;

/**
 * bit global config keys
 */
export const CFG_USER_EMAIL_KEY = 'user.email';

export const CFG_USER_NAME_KEY = 'user.name';

export const CFG_SSH_KEY_FILE_KEY = 'ssh_key_file';

export const CFG_HUB_DOMAIN_KEY = 'hub_domain';

export const CFG_POST_EXPORT_HOOK_KEY = 'post_export_hook';

export const CFG_POST_IMPORT_HOOK_KEY = 'post_import_hook';

export const CFG_CI_FUNCTION_PATH_KEY = 'ci_function_path';

export const CFG_CI_ENABLE_KEY = 'ci_enable';

/**
 * cache root directory
 */
export const CACHE_ROOT = getCacheDirectory();

/**
 * modules cache directory
 */
export const MODULES_CACHE_DIR = path.join(CACHE_ROOT, 'modules');

/**
 * app cache directory
 */
export const APP_CACHE_DIR = path.join(CACHE_ROOT, 'app');

/**
 * glboal config directories
 */
export const GLOBAL_CONFIG = path.join(CACHE_ROOT, 'config');

export const GLOBAL_CONFIG_FILE = 'config.json';

export const SOURCES_JSON = 'sources.json';

export const EXTERNAL_MAP = 'externals.json';

export const SOURCES_MAP = 'sources.json';

export const GLOBAL_REMOTES = 'global-remotes.json';

export const BIT_HIDDEN_DIR = '.bit';

export const BIT_CONTAINER_FOLDERS = ['sources'];

/**
 * modules cache filename
 */
export const MODULES_CACHE_FILENAME = path.join(MODULES_CACHE_DIR, '.roadrunner.json');

/**
 * bit registry default URL.
 */
export const BIT_REGISTRY = '';

export const LATEST = 'latest';

export const DEPENDENCY_DELIMITER = '/';

export const BIT_SOURCES_DIRNAME = 'source';

export const BIT_TMP_DIRNAME = 'tmp';

export const BIT_CACHE_DIRNAME = 'cache';

export const LATEST_TESTED_MARK = '*';

export const SCOPE_JSON = 'scope.json';

export const DEFAULT_RESOLVER = () => '';

/**
 * current bit application version
 */
export const BIT_VERSION = packageFile.version;

export const BIT_INSTALL_METHOD = packageFile.installationMethod;

export const RELEASE_SERVER = 'https://api.bitsrc.io/release';

export const SKIP_UPDATE_FLAG = '--skip-update';

export const LICENSE_FILENAME = 'LICENSE';

export const ISOLATED_ENV_ROOT = 'environment';
