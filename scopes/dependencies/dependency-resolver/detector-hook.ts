import type { DependencyDetector } from '@teambit/dependencies.modules.dependency-resolver-contracts';

export type {
  FileContext,
  DependencyContext,
  DependencyDetector,
} from '@teambit/dependencies.modules.dependency-resolver-contracts';

export class DetectorHook {
  static hooks: DependencyDetector[] = [];

  isSupported(ext: string, filename: string): boolean {
    return !!DetectorHook.hooks.find((hook) => {
      return hook.isSupported({
        ext,
        filename,
      });
    });
  }

  getDetector(ext: string, filename: string): DependencyDetector | undefined {
    return DetectorHook.hooks.find((hook) => {
      return hook.isSupported({
        ext,
        filename,
      });
    });
  }
}
