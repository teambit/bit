import createHook from './create-hook';

export const postExportHook = createHook('post_export_hook', 'post');
export const postImportHook = createHook('post_import_hook', 'post');
