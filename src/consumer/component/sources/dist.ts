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

  clone() {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new Dist(this);
  }
}
