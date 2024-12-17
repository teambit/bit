import findUp from 'find-up';
import { join } from 'path';
import { get } from 'lodash';
import fs from 'fs-extra';
import { parse } from 'comment-json';
import { getWorkspaceInfo } from '@teambit/workspace.modules.workspace-locator';
import { externals } from './externals';

let wsJsonc: any;
let packageJson: any;

async function getWsRootDir() {
  const consumerInfo = await getWorkspaceInfo(process.cwd());
  if (!consumerInfo) throw new Error('unable to find consumer');
  return consumerInfo.path;
}

function getPackageJsonPath(wsRootDir: string) {
  return join(wsRootDir, 'package.json');
}

function getWorkspaceJsoncPath(wsRootDir: string) {
  return join(wsRootDir, 'workspace.jsonc');
}

function loadPackageJson(wsRootDir: string) {
  const packageJsonPath = getPackageJsonPath(wsRootDir);
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const pkgJson = require(packageJsonPath);
  packageJson = pkgJson;
}

function loadWsJsonc(wsRootDir: string) {
  const wsJsoncPath = getWorkspaceJsoncPath(wsRootDir);
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const content = fs.readFileSync(wsJsoncPath, 'utf8');
  const parsed = parse(content);
  wsJsonc = parsed;
}

function resolveFromWsJsonc(packageName: string): string | undefined {
  const wsJsoncPolicy = wsJsonc['teambit.dependencies/dependency-resolver'].policy;
  const wsJsoncDependencies = wsJsoncPolicy.dependencies;
  const wsJsoncPeerDependencies = wsJsoncPolicy.peerDependencies;
  if (!wsJsoncPolicy) return undefined;
  const val = wsJsoncDependencies[packageName] || wsJsoncPeerDependencies[packageName];
  if (!val) return undefined;
  const packageVersion = typeof val === 'string' ? val : val.version;
  return packageVersion;
}

function resolveFromPackageJson(packageName: string): string | undefined {
  const packageVersion =
    get(packageJson, ['dependencies', packageName]) ||
    get(packageJson, ['devDependencies', packageName]) ||
    get(packageJson, ['peerDependencies', packageName]);
  return packageVersion;
}

async function resolveFromNodeModules(packageName: string): Promise<string | undefined> {
  try {
    const resolvedPath = require.resolve(packageName);
    if (!resolvedPath) return undefined;
    const packageJsonPath = findUp.sync('package.json', { cwd: resolvedPath });
    if (!packageJsonPath) return undefined;
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const pkgJson = require(packageJsonPath);
    if (pkgJson.name !== packageName) return undefined;
    return pkgJson.version;
  } catch {
    return undefined;
  }
}

function resolveHardCoded(packageName: string): string | undefined {
  // TODO: resolve this in a better way
  const hardCoded = {
    assert: '2.0.0',
    util: '0.12.3',
    url: '0.11.0',
    string_decoder: '1.3.0',
    punycode: '2.1.1',
    'react-app-polyfill': '1.0.6',
  };
  return hardCoded[packageName];
}

async function resolveExternalVersion(packageName: string) {
  const hardCodedVersion = resolveHardCoded(packageName);
  if (hardCodedVersion) return hardCodedVersion;
  const wsJsoncVersion = resolveFromWsJsonc(packageName);
  if (wsJsoncVersion) return wsJsoncVersion;
  const packageJsonVersion = resolveFromPackageJson(packageName);
  if (packageJsonVersion) return packageJsonVersion;
  const nodeModulesVersion = await resolveFromNodeModules(packageName);
  if (nodeModulesVersion) return nodeModulesVersion;
  return undefined;
}

const getPackageName = (packageName: string) => {
  const parts = packageName.split('/');
  if (parts.length === 1) return parts[0];
  if (!parts[0].startsWith('@')) return parts[0];
  return `${parts[0]}/${parts[1]}`;
};

// function getPkgConfig() {
//   const pkgConfig = {
//     scripts: 'build/**/*.js',
//     assets: 'views/**/*',
//     targets: ['latest-macos-arm64'],
//     outputPath: 'pkg-bundle',
//   };
//   return pkgConfig;
// }

export async function generatePackageJson(bundleDir: string, _bundleDirName: string, _jsAppFile: string) {
  const wsRootDir = await getWsRootDir();
  loadPackageJson(wsRootDir);
  loadWsJsonc(wsRootDir);
  const deps = {};
  const depsP = externals.map(async (packageName) => {
    const name = getPackageName(packageName);
    const version = await resolveExternalVersion(name);
    if (!version) {
      console.log(`unable to resolve version for ${name}`);
      return;
    }
    deps[name] = version;
  });
  await Promise.all(depsP);
  const finalPackageJson = {
    name: 'bundle',
    version: '0.0.0',
    dependencies: deps,
  };
  const packageJsonPath = join(bundleDir, 'package.json');
  fs.writeFileSync(packageJsonPath, JSON.stringify(finalPackageJson, null, 2));
}
