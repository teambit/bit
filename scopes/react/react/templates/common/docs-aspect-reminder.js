export const aspectReminder = (name) => `
### Important reminder
As with all aspects that you create, make sure to apply the \`teambit.harmony/aspect\` environment in order for this component to be built as a bit environment.

\`\`\`json
{
   "teambit.workspace/variants": {
     ...
     "extensions/${name}": { // if you put your new env inside the extensions folder. Adjust as needed for your directory structure.
       "teambit.harmony/aspect": {}
     }
     ...
   }
}
\`\`\`
`;
