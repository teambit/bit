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
  if (typeof window !== 'undefined') {
    if (!(window as any).__bit_preview_modules) {
      window.__bit_preview_modules = defaultPreviewModules;
    } else {
      modules = window.__bit_preview_modules;
    }
  }
  return modules;
}

const PREVIEW_MODULES = getPreviewModules();

export function linkModules(previewName: string, previewModule: PreviewModule) {
  PREVIEW_MODULES.set(previewName, previewModule);
}

export { PreviewModules, PREVIEW_MODULES };
