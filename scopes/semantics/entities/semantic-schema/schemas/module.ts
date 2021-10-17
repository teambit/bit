import { Export } from './export';

export class Module {
  constructor(
    /**
     * all module exports.
     */
    readonly exports: Export[]
  ) {}
}
