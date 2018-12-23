/** @flow */
import identityFile from '../../utils/ssh/identity-file';

/**
 * schema for passphrase prompt on SSH.
 */
export default {
  properties: {
    passphrase: {
      hidden: true,
      required: true,
      description: `enter passphrase for key '${identityFile()}'`
    }
  }
};
