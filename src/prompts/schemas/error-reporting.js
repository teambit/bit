/** @flow */

/**
 * schema for analytics.
 */
export default {
  properties: {
    errResponse: {
      required: true,
      default: 'Yes',
      description: 'Is it ok to send only error information to Bit’s error reporting platform? [Yes/no]',
      message: 'please use yes or no.',
      type: 'string',
      conform(value: string) {
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
