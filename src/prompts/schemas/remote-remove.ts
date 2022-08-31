/**
 * schema for remote remove.
 */
export default function (deleteFiles: boolean, remote: boolean) {
  const filesDeletionStr = deleteFiles
    ? ' and the files will be deleted from the filesystem (can be avoided by entering --keep-files)'
    : '';
  const remoteOrLocalOutput = remote
    ? `the component(s) will be permanently deleted from the remote. prefer using --soft to only mark the component as deleted`
    : `the component(s) will be untracked${filesDeletionStr}`;
  return {
    properties: {
      shouldRemove: {
        required: true,
        description: `${remoteOrLocalOutput}.
are you sure you would like to proceed with this operation? (yes[y]/no[n])`,
        message: 'please type yes or no.',
        type: 'string',
        conform(value: string) {
          return (
            value.toLowerCase() === 'y' ||
            value.toLowerCase() === 'n' ||
            value.toLowerCase() === 'yes' ||
            value.toLowerCase() === 'no'
          );
        },
      },
    },
  };
}
