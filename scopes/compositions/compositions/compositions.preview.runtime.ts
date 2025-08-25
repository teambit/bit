import type { ComponentID } from '@teambit/component-id';
import type { PreviewPreview, RenderingContext, PreviewModule, ModuleFile } from '@teambit/preview';
import { PreviewAspect, PreviewRuntime } from '@teambit/preview';
import head from 'lodash.head';
import type { CompositionBrowserMetadataObject } from './composition';
import { CompositionsAspect } from './compositions.aspect';

export class CompositionsPreview {
  constructor(
    /**
     * preview extension.
     */
    private preview: PreviewPreview
  ) {}

  private cache = new Map<string, ModuleFile>();

  render(componentId: ComponentID, envId: string, modules: PreviewModule, otherPreviewDefs, context: RenderingContext) {
    if (!modules.componentMap[componentId.fullName]) return;
    void this.renderAsync(componentId.fullName, envId, modules, modules.componentMap[componentId.fullName], context);
  }

  private async renderAsync(
    compKey: string,
    envId: string,
    modules: PreviewModule,
    entries: any[],
    context: RenderingContext
  ) {
    const files = await this.normalizeEntries(entries);
    const combined = Object.assign({}, ...files);
    this.cache.set(compKey, combined);

    const metadata = this.getMetadata(compKey, modules);
    const active = this.getActiveComposition(combined, metadata);

    const mainModule = modules.modulesMap[envId] || modules.modulesMap.default;
    let defaultExports = mainModule.default;
    // Sometime when using ESM (package.json with type:"module") the default export is nested under "default"
    if (typeof defaultExports !== 'function' && defaultExports.default) {
      defaultExports = defaultExports.default;
    }

    if (typeof defaultExports === 'function') {
      try {
        defaultExports(active, context);
      } catch (err) {
        // last-resort log – loaders already logged their own failures
        // eslint-disable-next-line no-console
        console.error('[preview][render:fail]', compKey, err);
      }
    }
  }

  /** Accepts modules or loader functions and returns an array of module objects. */
  private async normalizeEntries(entries: any[]): Promise<any[]> {
    const tasks = (entries || []).map((item) => {
      try {
        if (typeof item === 'function') {
          const p = item();
          if (p && typeof p.then === 'function') return p.catch(() => ({}));
          return Promise.resolve(p || {});
        }
        return Promise.resolve(item || {});
      } catch {
        return Promise.resolve({});
      }
    });
    try {
      return await Promise.all(tasks);
    } catch {
      return [];
    }
  }

  selectPreviewModel(componentFullName: string, previewModule: PreviewModule) {
    // Prefer the combined result produced during renderAsync (if already run)
    const cached = this.cache.get(componentFullName);
    if (cached) return cached;

    // Fallback: best-effort sync combine of whatever is there (ignore loader functions)
    const files = (previewModule.componentMap[componentFullName] || []).filter((x) => typeof x !== 'function');
    return Object.assign({}, ...files);
  }

  getMetadata(componentFullName: string, previewModule: PreviewModule): CompositionBrowserMetadataObject | undefined {
    const metadata = previewModule?.componentMapMetadata
      ? previewModule.componentMapMetadata[componentFullName]
      : undefined;
    if (metadata) {
      return metadata as CompositionBrowserMetadataObject;
    }
    return undefined;
  }

  private getActiveComposition(module: ModuleFile, metadata?: CompositionBrowserMetadataObject) {
    const firstQueryParam = window.location.hash.split('&')[1];
    const query = this.preview.getQuery();
    const compositionId = this.preview.getParam(query, 'name') || firstQueryParam;

    if (compositionId && module[compositionId]) {
      return module[compositionId];
    }

    if (metadata && metadata.compositions) {
      const first = head(metadata.compositions);
      const firstId = first?.identifier;
      if (firstId && module[firstId]) {
        return module[firstId];
      }
    }

    const first = head(Object.values(module));
    return first;
  }

  static runtime = PreviewRuntime;

  static dependencies = [PreviewAspect];

  static async provider([preview]: [PreviewPreview]) {
    const compPreview = new CompositionsPreview(preview);
    preview.registerPreview({
      name: 'compositions',
      render: compPreview.render.bind(compPreview),
      selectPreviewModel: compPreview.selectPreviewModel.bind(compPreview),
      default: true,
    });

    return compPreview;
  }
}

CompositionsAspect.addRuntime(CompositionsPreview);
