import createHook from './create-hook';
import HooksManager from './hooks-manager';

export const postExportHook = createHook('post_export_hook', 'post');
export const postImportHook = createHook('post_import_hook', 'post');
export const postRemoveHook = createHook('post_remove_hook', 'post');
export const postDeprecateHook = createHook('post_deprecate_hook', 'post');

export default HooksManager;
