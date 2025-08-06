import AbstractVinyl from './abstract-vinyl';

export default class Dist extends AbstractVinyl {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  clone(opts?: { contents?: boolean; deep?: boolean } | boolean): this {
    // @ts-expect-error
    return new Dist(this);
  }
}
