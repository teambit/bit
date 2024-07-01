import cliSpinners from 'cli-spinners';
import * as path from 'path';
import { homedir, platform } from 'os';

import { PathOsBased } from './utils/path';
import { getSync } from './api/consumer/lib/global-config';

const packageFile = require('../package.json');

export const IS_WINDOWS = platform() === 'win32';

function getDirectory(): PathOsBased {
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return path.join(process.env.LOCALAPPDATA, 'Bit');
  }

  return path.join(homedir(), '.bit');
}

export const CACHE_GLOBALS_ENV = 'BIT_GLOBALS_DIR';

function getCacheDirectory(): PathOsBased {
  const fromEnvVar = process.env[CACHE_GLOBALS_ENV];
  if (fromEnvVar && typeof fromEnvVar === 'string') {
    return fromEnvVar;
  }
  if (process.platform === 'darwin' || process.platform === 'linux') {
    return path.join(homedir(), 'Library', 'Caches', 'Bit');
  }

  return getDirectory();
}

/**
 * cache root directory
 */
export const CACHE_ROOT = getCacheDirectory();

/**
 * global config directories
 */
export const GLOBAL_CONFIG: PathOsBased = path.join(CACHE_ROOT, 'config');

export const GLOBAL_LOGS: PathOsBased = path.join(CACHE_ROOT, 'logs');

export const GLOBAL_SCOPE: PathOsBased = path.join(CACHE_ROOT, 'scope');

export const GLOBALS_DEFAULT_CAPSULES = path.join(CACHE_ROOT, 'capsules');

export const GLOBAL_CONFIG_FILE = 'config.json';

export const GLOBAL_REMOTES = 'global-remotes.json';

export const BIT_HIDDEN_DIR = '.bit';

export const BIT_GIT_DIR = 'bit';

export const DOT_GIT_DIR = '.git';

export const BIT_USAGE = '[--version] [--help] <command> [<args>]';

export const BITS_DIRNAME = 'components';

export const BIT_JSON = 'bit.json';

export const WORKSPACE_JSONC = 'workspace.jsonc';

export const GIT_IGNORE = '.gitignore';

export const BIT_MAP = '.bitmap';

export const OLD_BIT_MAP = '.bit.map.json';

export const TESTS_FORK_LEVEL = {
  NONE: 'NONE',
  ONE: 'ONE',
  COMPONENT: 'COMPONENT',
};

export const REPO_NAME = 'teambit/bit';

export const DEFAULT_INDEX_NAME = 'index';

export const DEFAULT_INDEX_EXTS = ['js', 'ts', 'jsx', 'tsx', 'cjs', 'mjs', 'mts', 'cts', 'css', 'scss', 'less', 'sass'];

export const SUPPORTED_EXTENSIONS = [
  '.js',
  '.ts',
  '.jsx',
  '.tsx',
  '.css',
  '.scss',
  '.less',
  '.sass',
  '.vue',
  '.styl',
  '.cjs',
  '.mjs',
  '.mts',
  '.cts',
];

export const NO_PLUGIN_TYPE = 'none';

export const DEFAULT_PACKAGE_MANAGER = 'npm';

export const DEFAULT_HARMONY_PACKAGE_MANAGER = 'teambit.dependencies/pnpm';

export const DEFAULT_EXTENSIONS = {};

export const DEFAULT_DIST_DIRNAME = 'dist';

export const DEFAULT_BUNDLE_FILENAME = 'dist.js';

export const DEFAULT_BIT_VERSION = '0.0.1';

export const DEFAULT_BIT_RELEASE_TYPE = 'patch'; // release type of semver (patch, minor, major)

export const DEFAULT_LANGUAGE = 'javascript';

export const DEFAULT_BINDINGS_PREFIX = '@bit';

export const NODE_PATH_COMPONENT_SEPARATOR = '.';

export const DEFAULT_COMPONENTS_DIR_PATH = `${BITS_DIRNAME}/{name}`;

export const COMPONENT_DIR = 'COMPONENT_DIR';

export const DEFAULT_SEPARATOR = '/';

export const LATEST_BIT_VERSION = 'latest';

export const OBJECTS_DIR = 'objects';

export const PENDING_OBJECTS_DIR = 'pending-objects';

export const REMOTE_REFS_DIR = path.join('refs', 'remotes');

export const WORKSPACE_LANES_DIR = path.join('workspace', 'lanes');

export const NULL_BYTE = '\u0000';

export const SPACE_DELIMITER = ' ';

export const VERSION_DELIMITER = '@';

export const SPINNER_TYPE = IS_WINDOWS ? cliSpinners.dots : cliSpinners.dots12;

/**
 * URLS
 */

/**
 * @deprecated use 'getCloudDomain()' or 'BASE_COMMUNITY_DOMAIN'
 */
export const BASE_WEB_DOMAIN = 'bit.dev';

export const CFG_CLOUD_DOMAIN_KEY = 'cloud_domain';

export const DEFAULT_CLOUD_DOMAIN = 'bit.cloud';
let resolvedCloudDomain;
export const getCloudDomain = (): string => {
  if (resolvedCloudDomain) return resolvedCloudDomain;
  resolvedCloudDomain = getSync(CFG_CLOUD_DOMAIN_KEY) || DEFAULT_CLOUD_DOMAIN;
  return resolvedCloudDomain;
};

export const BASE_COMMUNITY_DOMAIN = 'https://bit.dev';

export const PREVIOUSLY_BASE_WEB_DOMAIN = 'bitsrc.io';

export const DEFAULT_HUB_DOMAIN = `hub.${getCloudDomain()}`;

export const CFG_SYMPHONY_URL_KEY = 'symphony_url';

let resolvedSymphonyUrl;
export const getSymphonyUrl = (): string => {
  if (resolvedSymphonyUrl) return resolvedSymphonyUrl;
  resolvedSymphonyUrl = getSync(CFG_SYMPHONY_URL_KEY) || `api.v2.${getCloudDomain()}`;
  return resolvedSymphonyUrl;
};

export const CFG_CLOUD_DOMAIN_LOGIN_KEY = 'cloud_domain_login';

export const CFG_WATCH_USE_POLLING = 'watch_use_polling';
export const CFG_WATCH_USE_FS_EVENTS = 'watch_use_fsevents';

export const CFG_FORCE_LOCAL_BUILD = 'force_local_build';

export const getLoginUrl = (domain?: string): string => {
  const finalDomain = domain || getSync(CFG_CLOUD_DOMAIN_LOGIN_KEY) || getCloudDomain();
  const url = `https://${finalDomain}/bit-login`;
  return url;
};

export const SYMPHONY_GRAPHQL = `https://${getSymphonyUrl()}/graphql`;

export const BASE_DOCS_DOMAIN = `${BASE_COMMUNITY_DOMAIN}/`;

export const BASE_LEGACY_DOCS_DOMAIN = `legacy-docs.${BASE_COMMUNITY_DOMAIN}/docs`;

export const DEFAULT_ANALYTICS_DOMAIN = `https://analytics.${getCloudDomain()}/`;

export const SEARCH_DOMAIN = `api.${getCloudDomain()}`;

export const RELEASE_SERVER = `https://api.${getCloudDomain()}/release`;

export const DEFAULT_REGISTRY_URL = `https://node-registry.${DEFAULT_CLOUD_DOMAIN}`;

export const PREVIOUSLY_DEFAULT_REGISTRY_URL = `https://node.${PREVIOUSLY_BASE_WEB_DOMAIN}`;

export const CENTRAL_BIT_HUB_URL = `https://${getSymphonyUrl()}/exporter`;

// export const CENTRAL_BIT_HUB_URL_IMPORTER = `http://localhost:5001/importer/api/fetch`;
export const CENTRAL_BIT_HUB_URL_IMPORTER = `https://${getSymphonyUrl()}/importer/api/fetch`;
export const CENTRAL_BIT_HUB_URL_IMPORTER_V2 = `https://api.v2.bit.cloud/importer/api/fetch`;

export const CENTRAL_BIT_HUB_NAME = getCloudDomain();

// END URLS

export const DEFAULT_REGISTRY_DOMAIN_PREFIX = '@bit';

export const DEFAULT_BIT_ENV = 'production';

export const MergeConfigFilename = 'merge-conflict';

/**
 * use the .gitignore syntax. (not minimatch).
 * if you want to ignore only from component's root-dir, use `IGNORE_ROOT_ONLY_LIST` constant.
 */
export const IGNORE_LIST = [
  '**/.env',
  '**/.env.local',
  '**/.env.**.local',
  '**/.bit.map.json',
  '**/.bitmap',
  '**/bit.json',
  '**/component.json',
  '**/bitBindings.js',
  '**/node_modules/**',
  '**/package-lock.json',
  '**/yarn.lock',
];

/**
 * these files are ignored only if they exist in the component's rootDir.
 * avoid adding any wildcards or magic characters. specify the filename only.
 */
export const IGNORE_ROOT_ONLY_LIST = ['tsconfig.json', '.eslintrc.json', '.prettierrc.cjs'];

export const AUTO_GENERATED_STAMP = 'BIT-AUTO-GENERATED';
export const AUTO_GENERATED_MSG = `/* THIS IS A ${AUTO_GENERATED_STAMP} FILE. DO NOT EDIT THIS FILE DIRECTLY. */\n\n`;
export const BITMAP_PREFIX_MESSAGE = `/**
 * The Bitmap file is an auto generated file used by Bit to track all your Bit components. It maps the component to a folder in your file system.
 * This file should be committed to VCS(version control).
 * Components are listed using their component ID (${BASE_DOCS_DOMAIN}reference/components/component-id).
 * If you want to delete components you can use the "bit remove <component-id>" command.
 * See the docs (${BASE_DOCS_DOMAIN}reference/components/removing-components) for more information, or use "bit remove --help".
 */\n\n`;

/**
 * bit commands
 */
export const INIT_COMMAND = 'init';

export const ENV_VARIABLE_CONFIG_PREFIX = 'BIT_CONFIG_';
/**
 * bit global config keys
 */
export const CFG_USER_EMAIL_KEY = 'user.email';

export const CFG_USER_TOKEN_KEY = 'user.token';

export const CFG_USER_NAME_KEY = 'user.name';

export const CFG_REGISTRY_URL_KEY = 'registry';

export const CFG_HUB_DOMAIN_KEY = 'hub_domain';

export const CFG_ANALYTICS_DOMAIN_KEY = 'analytics_domain';

export const CFG_ANALYTICS_ANONYMOUS_KEY = 'anonymous_reporting';

export const CFG_REPOSITORY_REPORTING_KEY = 'repository_reporting';

export const CFG_ANALYTICS_REPORTING_KEY = 'analytics_reporting';

export const CFG_ANALYTICS_ERROR_REPORTS_KEY = 'error_reporting';

export const CFG_ANALYTICS_ENVIRONMENT_KEY = 'bit_environment';

export const CFG_ANALYTICS_USERID_KEY = 'analytics_id';

export const CFG_REGISTRY_DOMAIN_PREFIX = 'registry_domain_prefix';

export const CFG_POST_EXPORT_HOOK_KEY = 'post_export_hook';

export const CFG_POST_IMPORT_HOOK_KEY = 'post_import_hook';

export const CFG_CI_FUNCTION_PATH_KEY = 'ci_function_path';

export const CFG_CI_ENABLE_KEY = 'ci_enable';

export const CFG_GIT_EXECUTABLE_PATH = 'git_path';

export const CFG_LOG_JSON_FORMAT = 'log_json_format';

export const CFG_LOG_LEVEL = 'log_level';

export const CFG_NO_WARNINGS = 'no_warnings';

export const CFG_INTERACTIVE = 'interactive';

// Template for interactive config for specific command like interactive.init
export const CFG_COMMAND_INTERACTIVE_TEMPLATE = 'interactive.{commandName}';

export const CFG_INIT_DEFAULT_SCOPE = 'default_scope';
export const CFG_INIT_DEFAULT_DIRECTORY = 'default_directory';

export const CFG_FEATURE_TOGGLE = 'features';

export const CFG_PACKAGE_MANAGER_CACHE = 'package-manager.cache';

export const CFG_CAPSULES_ROOT_BASE_DIR = 'capsules_root_base_dir';

export const CFG_ISOLATED_SCOPE_CAPSULES = 'isolated_scope_capsules';

/**
 * Name of the directory where the capsules for building components are stored
 * This is used for the components capsules for bit build / tag / snap / sign
 * This directory is relative to the capsules root directory
 */
export const CFG_CAPSULES_BUILD_COMPONENTS_BASE_DIR = 'capsules_build_components_base_dir';

/**
 * Name of the directory where the capsules for aspects for regular scope are stored
 * This directory is relative to the capsules root directory
 */
export const CFG_CAPSULES_SCOPES_ASPECTS_BASE_DIR = 'capsules_scopes_aspects_base_dir';
/**
 * Name of the directory where the capsules for aspects for the global scope are stored
 * This directory is relative to the capsules root directory
 */
export const CFG_CAPSULES_GLOBAL_SCOPE_ASPECTS_BASE_DIR = 'capsules_global_scope_aspects_base_dir';

/**
 * Name of the directory where the dated (temp) capsules for aspects for regular scope are stored
 * This directory is relative to the capsules root directory
 */
export const CFG_CAPSULES_SCOPES_ASPECTS_DATED_DIR = 'capsules_scopes_aspects_dated_dir';

export const CFG_DEFAULT_RESOLVE_ENVS_FROM_ROOTS = 'default_resolve_envs_from_roots';

/**
 * whether to generate non existing capsules for scope aspects in a temp dated dir
 */
export const CFG_USE_DATED_CAPSULES = 'use_dated_capsules';

export const CFG_CACHE_LOCK_ONLY_CAPSULES = 'cache_lock_only_capsules';

export const CFG_PROXY = 'proxy';
export const CFG_HTTPS_PROXY = 'https_proxy';
export const CFG_PROXY_NO_PROXY = 'proxy.no_proxy';
// These are for backward compatibility
export const CFG_PROXY_CA = 'proxy.ca';
export const CFG_PROXY_CA_FILE = 'proxy.cafile';
export const CFG_PROXY_STRICT_SSL = 'proxy.strict_ssl';
export const CFG_PROXY_CERT = 'proxy.cert';
export const CFG_PROXY_KEY = 'proxy.key';

export const CFG_FETCH_RETRIES = 'network.fetch_retries';
export const CFG_FETCH_RETRY_FACTOR = 'network.fetch_retry_factor';
export const CFG_FETCH_RETRY_MINTIMEOUT = 'network.fetch_retry_mintimeout';
export const CFG_FETCH_RETRY_MAXTIMEOUT = 'network.fetch_retry_maxtimeout';
export const CFG_FETCH_TIMEOUT = 'network.fetch_timeout';
export const CFG_LOCAL_ADDRESS = 'network.local_address';
export const CFG_MAX_SOCKETS = 'network.max_sockets';
export const CFG_NETWORK_CONCURRENCY = 'network.concurrency';
export const CFG_NETWORK_CA = 'network.ca';
export const CFG_NETWORK_CA_FILE = 'network.cafile';
export const CFG_NETWORK_STRICT_SSL = 'network.strict-ssl';
export const CFG_NETWORK_CERT = 'network.cert';
export const CFG_NETWORK_KEY = 'network.key';

export const CFG_CONCURRENCY_IO = 'concurrency.io';
export const CFG_CONCURRENCY_COMPONENTS = 'concurrency.components';
export const CFG_CONCURRENCY_FETCH = 'concurrency.fetch';

export const CFG_CACHE_MAX_ITEMS_COMPONENTS = 'cache.max.components';
export const CFG_CACHE_MAX_ITEMS_OBJECTS = 'cache.max.objects';

/**
 * git hooks
 */
export const POST_CHECKOUT = 'post-checkout';

export const POST_MERGE = 'post-merge';

export const GIT_HOOKS_NAMES = [POST_CHECKOUT, POST_MERGE];

/**
 * bit hooks
 */
export const PRE_TAG_HOOK = 'pre-tag';

export const POST_TAG_HOOK = 'post-tag';

export const POST_ADD_HOOK = 'post-add';

export const PRE_TAG_ALL_HOOK = 'pre-tag-all';

export const POST_TAG_ALL_HOOK = 'post-tag-all';

export const PRE_IMPORT_HOOK = 'pre-import';

export const POST_IMPORT_HOOK = 'post-import';

export const PRE_EXPORT_HOOK = 'pre-export';

export const POST_EXPORT_HOOK = 'post-export';

export const PRE_SEND_OBJECTS = 'pre-send-objects'; // pre-fetch

export const POST_SEND_OBJECTS = 'post-send-objects'; // post-fetch

export const PRE_RECEIVE_OBJECTS = 'pre-receive-objects'; // pre-put

export const POST_RECEIVE_OBJECTS = 'post-receive-objects'; // post-put

export const PRE_DEPRECATE_REMOTE = 'pre-deprecate-remote';

export const PRE_UNDEPRECATE_REMOTE = 'pre-undeprecate-remote';

export const POST_DEPRECATE_REMOTE = 'post-deprecate-remote';

export const POST_UNDEPRECATE_REMOTE = 'post-undeprecate-remote';

export const PRE_REMOVE_REMOTE = 'pre-remove-remote';

export const POST_REMOVE_REMOTE = 'post-remove-remote';

export const HOOKS_NAMES = [
  PRE_TAG_HOOK,
  POST_TAG_HOOK,
  POST_ADD_HOOK,
  PRE_TAG_ALL_HOOK,
  POST_TAG_ALL_HOOK,
  PRE_IMPORT_HOOK,
  POST_IMPORT_HOOK,
  PRE_EXPORT_HOOK,
  POST_EXPORT_HOOK,
  PRE_SEND_OBJECTS,
  POST_SEND_OBJECTS,
  PRE_RECEIVE_OBJECTS,
  POST_RECEIVE_OBJECTS,
  PRE_DEPRECATE_REMOTE,
  PRE_UNDEPRECATE_REMOTE,
  POST_DEPRECATE_REMOTE,
  POST_UNDEPRECATE_REMOTE,
  PRE_REMOVE_REMOTE,
  POST_REMOVE_REMOTE,
];

/**
 * bit registry default URL.
 */
export const BIT_REGISTRY = '';

export const LATEST = 'latest';

export const HEAD = 'head';

export const DEPENDENCY_DELIMITER = '/';

export const BIT_SOURCES_DIRNAME = 'source';

export const BIT_TMP_DIRNAME = 'tmp';

export const BIT_WORKSPACE_TMP_DIRNAME = '.bitTmp';

export const BIT_CACHE_DIRNAME = 'cache';

export const SUB_DIRECTORIES_GLOB_PATTERN = '/**/*';

export const SCOPE_JSON = 'scope.json';
export const SCOPE_JSONC = 'scope.jsonc';

export const DEFAULT_RESOLVER = () => '';

/**
 * current bit application version
 */
export const BIT_VERSION = packageFile.version;

export const BIT_INSTALL_METHOD = packageFile.installationMethod;

export const TOKEN_FLAG_NAME = 'token';

export const TOKEN_FLAG = `${TOKEN_FLAG_NAME} <${TOKEN_FLAG_NAME}>`;

export const LICENSE_FILENAME = 'LICENSE';

export const ISOLATED_ENV_ROOT = 'environment';

export const NODE_PATH_SEPARATOR = process.platform === 'win32' ? ';' : ':'; // see here https://nodejs.org/api/modules.html#modules_loading_from_the_global_folders

export const WRAPPER_DIR = 'bit_wrapper_dir';

export const PACKAGE_JSON = 'package.json';

export const COMPONENT_CONFIG_FILE_NAME = 'component.json';

export const DEBUG_LOG: PathOsBased = path.join(GLOBAL_LOGS, 'debug.log');

export const MANUALLY_REMOVE_DEPENDENCY = '-';

export const MANUALLY_REMOVE_ENVIRONMENT = '-';

export const MANUALLY_ADD_DEPENDENCY = '+';

export const OVERRIDE_COMPONENT_PREFIX = '@bit/';

export const ACCEPTABLE_NPM_VERSIONS = '>=5.0.0';

export const ANGULAR_PACKAGE_IDENTIFIER = '@angular/core';

export const ANGULAR_BIT_ENTRY_POINT_FILE = ['public-api.ts', 'public_api.ts'];

export const COMPONENT_DIST_PATH_TEMPLATE = '{COMPONENT_DIST_PATH}';

export const WILDCARD_HELP = (command: string) =>
  `you can use a pattern for multiple ids, such as bit ${command} "utils/*". (wrap the pattern with quotes to avoid collision with shell commands)`;

export const PATTERN_HELP = (command: string) =>
  `you can use a \`<pattern>\` for multiple component ids, such as \`bit ${command} "org.scope/utils/**"\`.
use comma to separate patterns and '!' to exclude. e.g. 'ui/**, !ui/button'
use '$' prefix to filter by states/attributes, e.g. '$deprecated', '$modified' or '$env:teambit.react/react'.
always wrap the pattern with single quotes to avoid collision with shell commands.
use \`bit pattern --help\` to understand patterns better and \`bit pattern <pattern>\` to validate the pattern.
`;

export const COMPONENT_PATTERN_HELP = `component name, component id, or component pattern. use component pattern to select multiple components.
wrap the pattern with quotes. use comma to separate patterns and "!" to exclude. e.g. "ui/**, !ui/button".
use '$' prefix to filter by states/attributes, e.g. '$deprecated', '$modified' or '$env:teambit.react/react'.
use \`bit pattern --help\` to understand patterns better and \`bit pattern <pattern>\` to validate the pattern.`;

export const CURRENT_UPSTREAM = 'current';

export const DEPENDENCIES_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'];

export const HASH_SIZE = 40;

export const PREVIOUS_DEFAULT_LANE = 'master';

export const statusInvalidComponentsMsg = 'invalid components';
export const statusFailureMsg = 'issues found';
export const statusWarningsMsg = 'warnings found';
export const statusWorkspaceIsCleanMsg =
  'nothing to tag or export (use "bit create <template> <component>" to generate a new component)';

// todo: move the following two lines to the watch extension once its e2e moved to the extension dir
export const STARTED_WATCHING_MSG = 'started watching for component changes to rebuild';
export const WATCHER_COMPLETED_MSG = 'watching for changes';

export const NOTHING_TO_SNAP_MSG = 'nothing to snap';
export const AUTO_SNAPPED_MSG = 'auto-snapped dependents';

export const IMPORT_PENDING_MSG =
  'your workspace has outdated objects. please use "bit import" to pull the latest objects from the remote scope';

export enum Extensions {
  dependencyResolver = 'teambit.dependencies/dependency-resolver',
  pkg = 'teambit.pkg/pkg',
  compiler = 'teambit.compilation/compiler',
  envs = 'teambit.envs/envs',
  builder = 'teambit.pipelines/builder',
  deprecation = 'teambit.component/deprecation',
  forking = 'teambit.component/forking',
  renaming = 'teambit.component/renaming',
  lanes = 'teambit.lanes/lanes',
  remove = 'teambit.component/remove',
}

export enum BuildStatus {
  Pending = 'pending',
  Failed = 'failed',
  Succeed = 'succeed',
  Skipped = 'skipped', // e.g. when a version is marked as deleted.
}

export const SOURCE_DIR_SYMLINK_TO_NM = '_src'; // symlink from node_modules to the workspace sources files

export const FILE_CHANGES_CHECKOUT_MSG = 'components with file changes';

export const VERSION_CHANGED_BIT_ID_TO_COMP_ID = '1.2.10';
