/** @flow */

import * as pathLib from 'path';
import R from 'ramda';
import chalk from 'chalk';
import pMapSeries from 'p-map-series';
import Scope from './scope';
import { GLOBAL_SCOPE } from '../constants';
import { BitId } from '../bit-id';
import logger from '../logger/logger';
import componentResolver from '../component-resolver';
import IsolatedEnvironment from '../environment';
import { Analytics } from '../analytics/analytics';
import { ComponentNotFound } from './exceptions';

const removeNils = R.reject(R.isNil);

export type GlobalScopeProps = {
  path: string,
  scope: Scope
};

export type InstallExtensionsResult = {
  installed: BitId[],
  skipped: BitId[]
};

export default class GlobalScope {
  path: string;
  scope: Scope;

  constructor(scopeProps: GlobalScopeProps) {
    this.path = scopeProps.path;
    this.scope = scopeProps.scope;
  }

  getPath() {
    return this.path;
  }

  static async load(scopePath?: string = GLOBAL_SCOPE): Promise<GlobalScope> {
    const scope = await Scope.ensure(scopePath);
    return new GlobalScope({ scope, path: scopePath });
  }

  static async loadWithLocalRemotes(localScope: Scope, scopePath?: string = GLOBAL_SCOPE): Promise<GlobalScope> {
    const scope = await GlobalScope.load(scopePath);
    scope.scope.scopeJson.remotes = localScope.scopeJson.remotes;
    return scope;
  }

  /**
   * sync method that loads the environment/(path to environment component)
   */
  isExtensionInstalled(bitId: BitId) {
    if (!bitId) throw new Error('scope.isExtensionInstalled a required argument "bitId" is missing');
    logger.debugAndAddBreadCrumb('global-scope', 'isExtensionInstalled', { id: bitId.toString() });
    if (bitId.getVersion().latest) {
      logger.debugAndAddBreadCrumb(
        'global-scope.isExtensionInstalled',
        'requested extension version is latest, do not check if exist local, since there might be a newer version',
        { id: bitId.toString() }
      );
      return false;
    }
    const notFound = () => {
      logger.debugAndAddBreadCrumb('global-scope', 'Unable to find an extension component', { id: bitId.toString() });
      return false;
    };
    let extensionPath;
    try {
      extensionPath = this.getExtensionPath(bitId);
    } catch (err) {
      return notFound();
    }
    if (!IsolatedEnvironment.isExtensionInstalled(extensionPath)) return notFound();
    logger.debugAndAddBreadCrumb('global-scope', `found an environment file at ${extensionPath}`, { extensionPath });
    return true;
  }

  getExtensionPath(bitId: BitId): string {
    const extensionPath = componentResolver(bitId.toString(), null, this.getPath());
    return extensionPath;
  }

  async installExtensions({
    ids,
    dependentId,
    verbose,
    dontPrintEnvMsg
  }: {
    ids: [{ componentId: BitId, type?: string }],
    dependentId: BitId,
    verbose?: boolean,
    dontPrintEnvMsg?: boolean
  }): Promise<InstallExtensionsResult> {
    logger.debug(`global-scope.installExtensions, ids: ${ids.map(id => id.componentId).join(', ')}`);
    Analytics.addBreadCrumb('installExtensions', `globalScope.installExtensions, ids: ${Analytics.hashData(ids)}`);
    const res = {
      installed: [],
      skipped: []
    };
    const componentsDir = this.scope.getComponentsPath();
    const isolateOpts = {
      writeBitDependencies: false,
      installPackages: true,
      noPackageJson: false,
      dist: true,
      conf: false,
      override: false,
      verbose,
      silentPackageManagerResult: true
    };
    const idsWithoutNils = removeNils(ids);
    const predicate = id => id.componentId.toString(); // TODO: should be moved to BitId class
    const uniqIds = R.uniqBy(predicate)(idsWithoutNils);
    const nonExistingExtIds = uniqIds.filter((id) => {
      const isInstalled = this.isExtensionInstalled(id.componentId);
      if (isInstalled) {
        res.skipped.push(id.componentId);
      }
      return !isInstalled;
    });
    if (!nonExistingExtIds.length) {
      logger.debugAndAddBreadCrumb(
        'global-scope.installExtensions',
        'all extensions were successfully loaded, nothing to install'
      );
      return res;
    }

    const importExtension = async (id) => {
      let concreteId = id.componentId;
      if (id.componentId.getVersion().latest) {
        const concreteIds = await this.scope.fetchRemoteVersions([id.componentId]);
        concreteId = concreteIds[0];
        // Check again with the concrete version
        if (this.isExtensionInstalled(concreteId)) {
          res.skipped.push(concreteId);
          if (!dontPrintEnvMsg) {
            console.log(chalk.bold.green(`${concreteId.toString()} ${id.type} is already installed`));
          }
          return;
        }
      }
      res.installed.push(id.componentId);
      logger.debug(`scope.installExtensions.importExtension, id: ${concreteId.toString()}`);

      const dir = pathLib.join(componentsDir, Scope.getComponentRelativePath(concreteId));
      const env = new IsolatedEnvironment(this.scope, dir);
      // Destroying environment to make sure there is no left over
      await env.destroyIfExist();
      await env.create();
      try {
        await env.isolateComponent(concreteId, isolateOpts);
        if (!dontPrintEnvMsg) {
          console.log(chalk.bold.green(`successfully installed the ${concreteId.toString()} ${id.type}`));
        }
      } catch (e) {
        if (e instanceof ComponentNotFound) {
          e.dependentId = dependentId ? dependentId.toString() : '';
        }
        throw e;
      }
    };
    await pMapSeries(nonExistingExtIds, importExtension);
    return res;
  }
}
