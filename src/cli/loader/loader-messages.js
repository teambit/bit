/** @flow */

export const BEFORE_REMOTE_SHOW = 'fetching remote component';
export const BEFORE_IMPORT_ENVIRONMENT = 'importing environment dependencies...';
export const BEFORE_REMOTE_LIST = 'listing remote components';
export const BEFORE_LOCAL_LIST = 'listing components';
export const BEFORE_MIGRATION = 'upgrading working directory...';
export const BEFORE_REMOVE = 'removing components';
export const BEFORE_REMOTE_DEPRECATE = 'deprecating remote components';
export const BEFORE_IMPORT_ACTION = 'importing components';
export const BEFORE_REMOTE_SEARCH = ({ scope, queryStr }: { scope: string, queryStr: string }) =>
  `searching remote scope <${scope}> for '${queryStr}'`;
export const BEFORE_RUNNING_BUILD = 'building components';
export const BEFORE_RUNNING_SPECS = 'running specs';
export const BEFORE_IMPORT_PUT_ON_SCOPE = 'importing components';
export const BEFORE_PERSISTING_PUT_ON_SCOPE = 'persisting...';
export const BEFORE_INSTALL_NPM_DEPENDENCIES = 'ensuring package dependencies';
export const BEFORE_EXPORT = 'exporting component';
export const BEFORE_EXPORTS = 'exporting components';
export const BEFORE_LOADING_COMPONENTS = 'loading components';
export const BEFORE_STATUS = 'fetching status';
export const BEFORE_CHECKOUT = 'switching component version...';
