import { Module, Parser } from '@teambit/schema';

export class BabelParser implements Parser {
  public extension = /.ts|.js/;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  parseModule(modulePath: string): Module {
    throw new Error('please implement');
  }
}
