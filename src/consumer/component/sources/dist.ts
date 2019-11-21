import AbstractVinyl from './abstract-vinyl';

// @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
export default class Dist extends AbstractVinyl {
  static loadFromParsedString(parsedString: Record<string, any>) {
    if (!parsedString) return null;
    const opts = super.loadFromParsedString(parsedString);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new Dist(opts);
  }

  static loadFromParsedStringArray(arr: Record<string, any>[]) {
    if (!arr) return null;
    return arr.map(this.loadFromParsedString);
  }

  clone() {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return new Dist(this);
  }
}
