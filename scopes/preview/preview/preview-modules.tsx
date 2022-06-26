import type { PreviewModule, ModuleFile } from './types/preview-module';

type ModuleId = string;

export class PreviewModules extends Map<ModuleId, PreviewModule> {
  onSet = new Set<() => void>();

  override set(id: ModuleId, preview: PreviewModule) {
    super.set(id, preview);
    this.onSet.forEach((callback) => callback());
    return this;
  }

  loadComponentPreviews(compId: string, previews: Record<string, ModuleFile[]>) {
    Object.entries(previews).forEach(([previewName, moduleFile]) => {
      const preview = this.get(previewName);
      if (!preview) return; // TODO - ok for now

      preview.componentMap[compId] = moduleFile;
    });
  }
}
