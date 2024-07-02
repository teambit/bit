import { getTsconfig } from 'get-tsconfig';
import { basename, dirname } from 'path';
import { CompilerOptions } from 'typescript';
import { TsConfigNotFound } from './exceptions/tsconfig-not-found';

export type ComputeTsConfigOptions = {
  /**
   * tsconfig.
   */
  tsconfig?: string;

  /**
   * if provided, ignoring tsconfig.
   */
  compilerOptions?: CompilerOptions;
};

export function computeTsConfig({ tsconfig, compilerOptions }: ComputeTsConfigOptions) {
  if (compilerOptions) {
    return {
      compilerOptions,
    };
  }
  const tsconfigContents = tsconfig ? getTsconfig(dirname(tsconfig), basename(tsconfig)) : undefined;
  if (tsconfigContents?.config) return tsconfigContents?.config;
  throw new TsConfigNotFound();
}
