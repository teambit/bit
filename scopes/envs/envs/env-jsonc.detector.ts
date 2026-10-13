import { parse } from 'comment-json';
import { DetectorHook, type DependencyDetector, type FileContext } from '@teambit/dependency-resolver';

// Captured during module initialization before consumers can patch the prototype.
let nativePredicate: DependencyDetector['isSupported'];

export class EnvJsoncDetector implements DependencyDetector {
  constructor() {
    if (new.target === EnvJsoncDetector) {
      DetectorHook.registerNativeEnvJsoncDetector(this, EnvJsoncDetector.prototype, nativePredicate);
    }
  }

  isSupported(context: FileContext): boolean {
    return context.filename.endsWith('env.jsonc');
  }

  detect(source: string): string[] {
    let parsed: Record<string, any>;
    try {
      parsed = parse(source) as Record<string, any>;
    } catch (err: any) {
      throw new Error(`Failed to parse env.jsonc: ${err.message}`);
    }
    if (!parsed.extends) return [];
    return [parsed.extends];
  }
}

nativePredicate = EnvJsoncDetector.prototype.isSupported;
