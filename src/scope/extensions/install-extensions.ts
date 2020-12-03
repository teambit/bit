import chalk from 'chalk';
import mapSeries from 'p-map-series';
import * as pathLib from 'path';
import R from 'ramda';

import { Scope } from '..';
import { Analytics } from '../../analytics/analytics';
import { BitId } from '../../bit-id';
import componentResolver from '../../component-resolver';
import IsolatedEnvironment from '../../environment';
import { IsolateOptions } from '../../environment/isolator';
import logger from '../../logger/logger';
import ComponentWithDependencies from '../component-dependencies';
import { ComponentNotFound } from '../exceptions';
import { fetchRemoteVersions } from '../scope-remotes';

const removeNils = R.reject(R.isNil);

export default function installExtensions({
  ids,
  dependentId,
  scope,
  verbose,
  dontPrintEnvMsg,
}: {
  ids: [{ componentId: BitId; type?: string }];
  dependentId?: BitId;
  scope: Scope;
  verbose?: boolean;
  dontPrintEnvMsg?: boolean;
}): Promise<ComponentWithDependencies[]> {
  logger.debug(`scope.installEnvironment, ids: ${ids.map((id) => id.componentId).join(', ')}`);
  Analytics.addBreadCrumb('installEnvironment', `scope.installEnvironment, ids: ${Analytics.hashData(ids)}`);
  const componentsDir = scope.getComponentsPath();
  const isolateOpts: IsolateOptions = {
    writeBitDependencies: false,
    installNpmPackages: true,
    writePackageJson: true,
    writeDists: true,
    writeConfig: false,
    installPeerDependencies: true,
    override: false,
    installProdPackagesOnly: true,
    verbose,
    silentPackageManagerResult: true,
  };
  const idsWithoutNils = removeNils(ids);
  const predicate = (id) => id.componentId.toString(); // TODO: should be moved to BitId class
  const uniqIds = R.uniqBy(predicate)(idsWithoutNils);
  const nonExistingEnvsIds = uniqIds.filter((id) => {
    return !isEnvironmentInstalled(scope, id.componentId);
  });
  if (!nonExistingEnvsIds.length) {
    logger.debug('scope.installEnvironment, all environment were successfully loaded, nothing to install');
    Analytics.addBreadCrumb(
      'installEnvironment',
      'scope.installEnvironment, all environment were successfully loaded, nothing to install'
    );
    return Promise.resolve([]);
  }

  const importEnv = async (id) => {
    let concreteId = id.componentId;
    if (id.componentId.getVersion().latest) {
      const concreteIds = await fetchRemoteVersions(scope, [id.componentId]);
      concreteId = concreteIds[0];
    }
    logger.debug(`scope.installEnvironment.importEnv, id: ${concreteId.toString()}`);

    const dir = pathLib.join(componentsDir, Scope.getComponentRelativePath(concreteId));
    const env = new IsolatedEnvironment(scope, dir);
    // Destroying environment to make sure there is no left over
    await env.destroyIfExist();
    await env.create();
    try {
      const isolatedComponent = await env.isolateComponent(concreteId, isolateOpts);
      if (!dontPrintEnvMsg) {
        // eslint-disable-next-line no-console
        logger.console(chalk.bold.green(`successfully installed the ${concreteId.toString()} ${id.type}`), 'debug');
      }
      return isolatedComponent;
    } catch (e) {
      if (e instanceof ComponentNotFound) {
        e.dependentId = dependentId ? dependentId.toString() : null;
      }
      throw e;
    }
  };
  return mapSeries(nonExistingEnvsIds, importEnv);
}

/**
 * sync method that loads the environment/(path to environment component)
 */
export function isEnvironmentInstalled(scope: Scope, bitId: BitId) {
  logger.debug(`scope.isEnvironmentInstalled, id: ${bitId.toString()}`);
  Analytics.addBreadCrumb(
    'isEnvironmentInstalled',
    `scope.isEnvironmentInstalled, id: ${Analytics.hashData(bitId.toString())}`
  );
  if (!bitId) throw new Error('scope.isEnvironmentInstalled a required argument "bitId" is missing');
  const notFound = () => {
    logger.debug(`Unable to find an env component ${bitId.toString()}`);
    Analytics.addBreadCrumb(
      'isEnvironmentInstalled',
      `Unable to find an env component ${Analytics.hashData(bitId.toString())}`
    );

    return false;
  };

  let envPath;
  try {
    envPath = componentResolver(bitId.toString(), null, scope.getPath());
  } catch (err) {
    return notFound();
  }
  if (!IsolatedEnvironment.isEnvironmentInstalled(envPath)) return notFound();

  logger.debug(`found an environment file at ${envPath}`);
  Analytics.addBreadCrumb('isEnvironmentInstalled', `found an environment file at ${Analytics.hashData(envPath)}`);
  return true;
}
