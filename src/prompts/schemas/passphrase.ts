import identityFile from '../../utils/ssh/identity-file';

/**
 * // TODO: FIX if this function is used. identityFile() is now async.
 * schema for passphrase prompt on SSH.
 */
export default {
  properties: {
    passphrase: {
      hidden: true,
      required: true,
      description: `enter passphrase for key '${identityFile()}'`,
    },
  },
};
