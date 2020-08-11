// Warnings
export const UNABLE_TO_LOAD_EXTENSION = (id: string) => `error: unable to load the extension "${id}"`;
export const UNABLE_TO_LOAD_EXTENSION_FROM_LIST = (ids: string[]) =>
  `couldn't load one of the following extensions ${ids.join(', ')}, see full error in the log file`;
