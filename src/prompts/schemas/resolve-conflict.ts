/**
 * schema for resolve conflict
 */
export default {
  properties: {
    mergeStrategy: {
      required: true,
      description: `enter resolve-conflict strategy option:
o (ours) to use the current modified files
t (theirs) to use the specified version (and override the modification)
m (manual) to merge the modified files with the specified version and leave the files in a conflict state
`,
      message: 'please use the following options only: o, t or m',
      type: 'string',
      conform(value: string): boolean {
        value = value.toLowerCase();
        const options = ['o', 't', 'm'];
        return options.includes(value);
      },
    },
  },
};
