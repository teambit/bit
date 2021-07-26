import { ComponentContext } from '@teambit/generator';

export function docFile({ name }: ComponentContext) {
  return `---
description: Application.
labels: ['env', 'app']
---

## Application component

- The app file contains components from react router dom so you can add here all routes for your app and include all your page components.
- The main runtime file contains what is needed to build your application as a React app.
- The app root file renders your app to the DOM.
- The compositions file renders your app so it can be seen in the compositions tab.
- The aspect file contains the id of the aspect. You will need to modify this with your own org name, scope name and namespace if any, and then add it to your \`workspace.json\` file at root level like:

\`\`\`json
"org-name.scope-name/namespace/name": {},
\`\`\`

### Run the application

You can run your application on a separate port to see it outside of the Bit workspace

\`\`\`bash
bit run ${name}
\`\`\`
`;
}
