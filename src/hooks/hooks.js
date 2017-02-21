import createHook from './create-hook';
import { CFG_POST_EXPORT_HOOK_KEY, CFG_POST_IMPORT_HOOK_KEY } from '../constants';

export const postExportHook = createHook(CFG_POST_EXPORT_HOOK_KEY, 'post');
export const postImportHook = createHook(CFG_POST_IMPORT_HOOK_KEY, 'post');
