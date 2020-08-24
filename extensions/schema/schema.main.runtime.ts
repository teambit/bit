import { MainRuntime } from '@teambit/cli';
import { Slot, SlotRegistry } from '@teambit/harmony';

import { ParserNotFound } from './exceptions';
import { Parser } from './parser';
import { SchemaAspect } from './schema.aspect';
import { Module } from './schemas';

export type ParserSlot = SlotRegistry<Parser>;

/**
 * extension for extracting component schemas.
 */
export class SchemaMain {
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
  registerParser(parser: Parser): SchemaMain {
    this.parserSlot.register(parser);
    return this;
  }

  static runtime = MainRuntime;

  static slots = [Slot.withType<Parser>()];

  static async provider(deps, config, [parserSlot]: [ParserSlot]) {
    return new SchemaMain(parserSlot);
  }
}

SchemaAspect.addRuntime(SchemaMain);
