import { PreviewModule } from './types/preview-module';

type ModuleId = string;

export class PreviewModules extends Map<ModuleId, PreviewModule> {
  onSet = new Set<() => void>();

  override set(id: ModuleId, preview: PreviewModule) {
    super.set(id, preview);
    this.onSet.forEach((callback) => callback());
    return this;
  }
}
