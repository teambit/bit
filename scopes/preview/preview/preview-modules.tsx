import { PreviewModules, PreviewModule, PREVIEW_MODULES } from '@teambit/preview.modules.preview-modules';

declare global {
  interface Window {
    __bit_preview_modules: PreviewModules;
  }
}

export function linkModules(previewName: string, previewModule: PreviewModule) {
  // singleton for the browser
  let modules = PREVIEW_MODULES;
  if (typeof window !== 'undefined') {
    if (!(window as any).__bit_preview_modules) {
      window.__bit_preview_modules = PREVIEW_MODULES;
    } else {
      modules = window.__bit_preview_modules;
    }
  }

  modules.set(previewName, previewModule);
}

export { PreviewModules, PREVIEW_MODULES };

// import type { PreviewModule, ModuleFile } from './types/preview-module';

// type ModuleId = string;

// export class PreviewModules extends Map<ModuleId, PreviewModule> {
//   onSet = new Set<() => void>();

//   override set(id: ModuleId, preview: PreviewModule) {
//     super.set(id, preview);
//     this.onSet.forEach((callback) => callback());
//     return this;
//   }

//   loadComponentPreviews(compId: string, previews: Record<string, ModuleFile[]>) {
//     Object.entries(previews).forEach(([previewName, moduleFile]) => {
//       const preview = this.get(previewName);
//       if (!preview) return; // TODO - ok for now

//       preview.componentMap[compId] = moduleFile;
//     });
//   }
// }

// export const PREVIEW_MODULES = new PreviewModules();

// export function linkModules(previewName: string, previewModule: PreviewModule) {
//   PREVIEW_MODULES.set(previewName, previewModule);
// }
