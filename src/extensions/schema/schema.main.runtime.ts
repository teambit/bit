import { Slot, SlotRegistry } from '@teambit/harmony';
import { Module } from './schemas';
import { Parser } from './parser';
import { ParserNotFound } from './exceptions';

export type ParserSlot = SlotRegistry<Parser>;

/**
 * extension for extracting component schemas.
 */
export class SchemaExtension {
  constructor(
    /**
     * parsers slot.
     */
    private parserSlot: ParserSlot
  ) {}

  /**
   * parse a module into a component schema.
   */
  parseModule(path: string): Module {
    const parsers = this.parserSlot.toArray();
    const maybeParser = parsers.find(([, parser]) => path.match(parser.extension));

    if (!maybeParser) {
      throw new ParserNotFound(path);
    }

    const [, parser] = maybeParser;
    return parser.parseModule(path);
  }

  /**
   * register a new parser.
   */
  registerParser(parser: Parser): SchemaExtension {
    this.parserSlot.register(parser);
    return this;
  }

  static slots = [Slot.withType<Parser>()];

  static async provider(deps, config, [parserSlot]: [ParserSlot]) {
    return new SchemaExtension(parserSlot);
  }
}
