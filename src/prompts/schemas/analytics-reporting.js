/** @flow */

/**
 * schema for analytics.
 */
export default {
  properties: {
    analyticsResponse: {
      required: true,
      description: `To help us prioritize new features and bug fixes, Bit can collect anonymous statistics about its usage. Staying opted-in is completely voluntary and helps us improve Bit and build a better product for you.
Read the analytics documentation - [link]
Is it ok to help Bit with anonymous usage analytics? [Yes/no]`,
      message: 'please use yes or no.',
      type: 'string',
      conform(value) {
        return (
          value.toLowerCase() === 'y' ||
          value.toLowerCase() === 'n' ||
          value.toLowerCase() === 'yes' ||
          value.toLowerCase() === 'no'
        );
      }
    }
  }
};
