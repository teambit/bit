import { Extension } from '../harmony';
import { TypeScript } from './typescript';

Extension.instantiate({
  name: 'TypeScript',
  dependencies: [],
  config: {},
  provider: TypeScript.provide
});
