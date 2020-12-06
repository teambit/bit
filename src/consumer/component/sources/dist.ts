import AbstractVinyl from './abstract-vinyl';

export default class Dist extends AbstractVinyl {
  static loadFromParsedString(parsedString: Record<string, any>): Dist | null {
    if (!parsedString) return null;
    const opts = super.loadFromParsedStringBase(parsedString);
    return new Dist(opts);
  }

  static loadFromParsedStringArray(arr: Record<string, any>[]): Dist[] | null | undefined {
    if (!arr) return null;
    // @ts-ignore
    return arr.map(this.loadFromParsedString);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  clone(opts?: { contents?: boolean; deep?: boolean } | boolean): this {
    // @ts-ignore
    return new Dist(this);
  }
}
