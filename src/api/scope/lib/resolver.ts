import { loadScope } from '../../../scope';

export const setResolver = (currentPath: string, resolverPath: string): Promise<any> => {
  return loadScope(currentPath).then((scope) => {
    scope.scopeJson.resolverPath = resolverPath;
    return scope.scopeJson.write(scope.getPath());
  });
};

export const getResolver = (currentPath: string): Promise<string | null | undefined> => {
  return loadScope(currentPath).then((scope) => scope.scopeJson.resolverPath);
};

export const resetResolver = (currentPath: string): Promise<any> => {
  return loadScope(currentPath).then((scope) => {
    scope.scopeJson.resolverPath = null;
    return scope.scopeJson.write(scope.getPath());
  });
};
