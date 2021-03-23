import { Command } from '@teambit/cli';
import { GeneratorMain } from './generator.main.runtime';

export class GeneratorCmd implements Command {
  name = 'create [componentName] [templateName]';
  description = 'create a new component from a template';
  shortDescription = '';
  alias = '';
  group = '';
  private = true;
  options = [];

  constructor(private generator: GeneratorMain) {}

  async report([componentName, templateName]: [string, string]) {
    // @ts-ignore
    const results = await this.generator.generateComponentTemplate(componentName, templateName);
    const result = results.addedComponents[0];
    console.log('🚀 ~ file: generator.cmd.ts ~ line 24 ~ CreateCmd ~ render ~ result', result);
    return JSON.stringify(result, undefined, 4);

    // const files = result.files.map((item, key) => (
    //   <li key={key}>
    //     <Text color="green">{item.relativePath}</Text>
    //   </li>
    // ));

    // // eslint-disable-next-line @typescript-eslint/no-unused-vars
    // const AddedComponent = () => (
    //   <Box padding={1} flexDirection="column">
    //     <Box>
    //       <Text>
    //         tracking component <Text bold>{result.id}</Text>
    //       </Text>
    //     </Box>
    //     <Box paddingLeft={2}>
    //       <ul>{files}</ul>
    //     </Box>
    //   </Box>
    // );

    // return <AddedComponent />;
  }
}
