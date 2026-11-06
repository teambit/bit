/**
 * copied over from https://github.com/typescript-language-server/typescript-language-server/blob/master/src/modules-resolver.ts
 * modified to accommodate Bit needs
 */

/*
 * Copyright (C) 2017, 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
export function findPathToModule(dir: string, moduleName: string): string | undefined {
  try {
    return require.resolve(moduleName, { paths: [dir] });
  } catch {
    return undefined;
  }
}
