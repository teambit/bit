/**
 * schema for passphrase prompt on SSH.
 */
export default {
  properties: {
    username: {
      required: true,
    },
    password: {
      hidden: true,
      required: true,
    },
  },
};
