/** @flow */

export const BEFORE_REMOTE_SHOW = 'fetching remote component';
export const BEFORE_IMPORT_ENVIRONMENT = 'importing environment dependencies...';
export const BEFORE_REMOTE_LIST = 'listing remote components';
export const BEFORE_MODIFY_ACTION = 'modify component';
export const BEFORE_IMPORT_ACTION = 'importing components';
export const BEFORE_REMOTE_SEARCH = ({ scope, queryStr }: { scope: string, queryStr: string }) =>
`searching remote scope <${scope}> for '${queryStr}'`;
export const BEFORE_RUNNING_SPECS = 'running specs';
export const BEFORE_IMPORT_PUT_ON_SCOPE = 'importing components';
export const BEFORE_PERSISTING_PUT_ON_SCOPE = 'persisting...';
export const BEFORE_INSTALL_NPM_DEPENDENCIES = 'ensuring npm dependencies';
export const BEFORE_EXPORT = 'exporting component';
