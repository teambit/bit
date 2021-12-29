import { ComponentContext } from '@teambit/generator';

export const componentFile = (context: ComponentContext) => {
  const { name, namePascalCase: Name } = context;

  return {
    relativePath: `${name}.tsx`,
    content: `import React from 'react';
import { Text, StyleSheet } from 'react-native';

export type ${Name}Props = {
  /**
   * a text to be rendered in the component.
   */
  text: string
};

export function ${Name}({ text }: ${Name}Props) {
  return (
    <Text style={styles.text}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {},
});
`,
  };
};
