import { Extension } from '../harmony';
import { CompilerExt } from '../compiler';
import { TypeScript } from './typescript';

Extension.instantiate({
  name: 'TypeScript',
  dependencies: [CompilerExt],
  config: {},
  provider: TypeScript.provide
});
