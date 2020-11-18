import { MainRuntime } from '@teambit/cli';

export class LanguageServerMain {
  static runtime = MainRuntime;

  static async provider() {
    return new LanguageServerMain();
  }
}
