import { parse } from 'comment-json';
import type { DependencyDetector, FileContext } from '@teambit/dependency-resolver';

export class EnvJsoncDetector implements DependencyDetector {
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
