import type { ComponentModel } from '@teambit/component';
import { affix } from '@teambit/base-ui.utils.string.affix';

/**
 * generates a full url to a preview (overview / docs etc)
 */
export function toPreviewUrl(component: ComponentModel, previewName?: string, additionalParams?: string | string[]) {
  const serverPath = toPreviewServer(component);
  const hash = toPreviewHash(component, previewName, additionalParams);

  return `${serverPath}#${hash}`;
}

/**
 * generates preview server path from component data
 */
export function toPreviewServer(component: ComponentModel) {
  let explicitUrl = component.server?.url;
  // quickfix - preview urls in `start` (without `--dev`) won't work without trailing '/'
  if (explicitUrl && !explicitUrl.endsWith('/')) explicitUrl += '/';

  // // not fully working in bare-scope, and does not support version
  // const envId = component.environment?.id;
  // const envBasedUrl = `/preview/${envId}`;

  // fallback url for all components. Includes versions support
  // for example - "/api/teambit.base-ui/input/button@0.6.2/~aspect/preview/"
  const defaultServerUrl = `/api/${component.id.toString()}/~aspect/preview/`;

  return explicitUrl || /* envBasedUrl || */ defaultServerUrl;
}

/**
 * creates component preview arguments
 */
export function toPreviewHash(
  /**
   * component to preview
   */
  component: ComponentModel,
  /**
   * current preview (docs, compositions, etc)
   */
  previewName?: string,
  /**
   * extra data to append to query
   */
  queryParams: string | string[] = ''
) {
  const previewParam = affix(`preview=`, previewName);

  const hashQuery = [previewParam]
    .concat(queryParams)
    .filter((x) => !!x) // also removes empty strings
    .join('&');

  const hash = `${component.id.toString()}${affix('?', hashQuery)}`;

  return hash;
}
