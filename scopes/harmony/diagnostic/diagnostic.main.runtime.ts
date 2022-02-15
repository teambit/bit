import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { Slot, SlotRegistry } from '@teambit/harmony';
import { MainRuntime } from '@teambit/cli';
import { ExpressAspect, ExpressMain } from '@teambit/express';
import { DiagnosticAspect } from './diagnostic.aspect';
import { DiagnosticRoute } from './diagnostic.route';
import { Diagnostic } from './diagnostic';
import { writeFile } from 'fs';

export type DiagnosticSlot = SlotRegistry<Diagnostic>;

export class DiagnosticMain {
  constructor(
    /** the diagnostic entity slot */
    private diagnosticSlot: DiagnosticSlot
  ) {}
  static slots = [Slot.withType<Diagnostic[]>()];
  static dependencies = [ExpressAspect];
  static runtime = MainRuntime;

  register(diagnostic: Diagnostic | Diagnostic[]) {
    if (Array.isArray(diagnostic)) {
      diagnostic.forEach((e) => {
        this.diagnosticSlot.register(e);
      });
    } else this.diagnosticSlot.register(diagnostic);
    return this;
  }

  // TODO: joni support array
  getDiagnosticData() {
    const slots = this.diagnosticSlot.toArray();

    const newSlots = slots.map(([aspectId, diagnostic]) => {
      const { diagnosticFn } = diagnostic;
      const diagnosticData = diagnosticFn();
      return {
        aspectId,
        diagnosticData,
      };
    });
    return newSlots;
  }

  static getBitVersion() {
    const buffer = readFileSync(join(dirname(require.resolve('@teambit/bit')), '../', 'package.json'));
    const json = JSON.parse(buffer.toString());
    return json;
  }

  static async provider([express]: [ExpressMain], config: any, [diagnosticSlot]: [DiagnosticSlot]) {
    const diagnosticMain = new DiagnosticMain(diagnosticSlot);
    diagnosticMain.register({ diagnosticFn: DiagnosticMain.getBitVersion });
    express.register([new DiagnosticRoute(diagnosticMain)]);
    return diagnosticMain;
  }
}

DiagnosticAspect.addRuntime(DiagnosticMain);
