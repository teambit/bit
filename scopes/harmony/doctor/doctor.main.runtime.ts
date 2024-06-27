import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { DoctorAspect } from './doctor.aspect';
import { DoctorCmd } from './doctor-cmd';

export class DoctorMain {
  static slots = [];
  static dependencies = [CLIAspect];
  static runtime = MainRuntime;
  static async provider([cliMain]: [CLIMain]) {
    cliMain.register(new DoctorCmd());
    return new DoctorMain();
  }
}

DoctorAspect.addRuntime(DoctorMain);

export default DoctorMain;
