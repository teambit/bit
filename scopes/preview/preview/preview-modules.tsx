import {
  PreviewModules,
  PreviewModule,
  PREVIEW_MODULES as defaultPreviewModules,
} from '@teambit/preview.modules.preview-modules';

declare global {
  interface Window {
    __bit_preview_modules: PreviewModules;
  }
}

// singleton for the browser
function getPreviewModules() {
  let modules = defaultPreviewModules;
  console.log('\n[PREVIEW_MODULES] default', modules);
  if (typeof window !== 'undefined') {
    if (!(window as any).__bit_preview_modules) {
      window.__bit_preview_modules = defaultPreviewModules;
      console.log('\n[PREVIEW_MODULES] set to windows', modules);
    } else {
      modules = window.__bit_preview_modules;
      console.log('\n[PREVIEW_MODULES] get from windows', modules);
    }
  }
  return modules;
}

const PREVIEW_MODULES = getPreviewModules();

console.log('\n[PREVIEW_MODULES] finally', PREVIEW_MODULES);

export function linkModules(previewName: string, previewModule: PreviewModule) {
  console.log('\n[PREVIEW_MODULES] set before', { previewName, previewModule });
  PREVIEW_MODULES.set(previewName, previewModule);
  console.log('\n[PREVIEW_MODULES] set after', PREVIEW_MODULES);
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
