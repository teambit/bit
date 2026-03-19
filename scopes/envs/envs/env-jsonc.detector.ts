import { parse } from 'comment-json';
import type { DependencyDetector, FileContext } from '@teambit/dependency-resolver';

export class EnvJsoncDetector implements DependencyDetector {
  private lastFilename = '';

  isSupported(context: FileContext): boolean {
    const supported = context.filename.endsWith('env.jsonc') || context.filename.endsWith('tsconfig.json');
    if (supported) this.lastFilename = context.filename;
    return supported;
  }

  detect(source: string): string[] {
    let parsed: Record<string, any>;
    try {
      parsed = parse(source) as Record<string, any>;
    } catch (err: any) {
      throw new Error(`Failed to parse ${this.lastFilename}: ${err.message}`);
    }
    if (!parsed.extends) return [];
    const extendsArr: string[] = Array.isArray(parsed.extends) ? parsed.extends : [parsed.extends];
    // only return non-relative extends (i.e. package references)
    return extendsArr.filter((ext) => !ext.startsWith('.'));
  }
}
