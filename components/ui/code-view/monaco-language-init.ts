/* eslint-disable guard-for-in */
/* eslint-disable no-restricted-syntax */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { Monaco } from '@monaco-editor/react';

export const richLanguageConfiguration: monaco.languages.LanguageConfiguration = {
  wordPattern: /(-?\d*\.\d\w*)|([^`~!@#%^&*()-=+[\]{}\\|;:'",.<>/?\s]+)/g,
  comments: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  __electricCharacterSupport: {
    docComment: { open: '/**', close: ' */' },
  },
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"', notIn: ['string'] },
    { open: "'", close: "'", notIn: ['string', 'comment'] },
    { open: '`', close: '`' },
  ],
};

export const customTokenizer: monaco.languages.IMonarchLanguage = {
  tokenizer: {
    root: [
      [/<(?=[A-Za-z])/, { token: 'delimiter.angle', next: '@tag' }],
      [/<\/(?=[A-Za-z])/, { token: 'delimiter.angle', next: '@closingTag' }],
    ],
    tag: [
      [/\s+/, ''],
      [
        /([A-Za-z_$][A-Za-z$]*)(?=[\s\n]*[/>]|[\s\n]*)/,
        { cases: { '[A-Z$][\\w$]*': 'tag.custom', '@default': 'tag.dom' } },
      ],
      [/([A-Za-z_$][A-Za-z$]*)(?=[\s\n]*=)/, 'attribute.key'], // 2
      [/\/>/, { token: 'delimiter.angle', next: '@pop' }],
      [/>/, { token: 'delimiter.angle', next: '@pop' }],
      [/=/, 'delimiter'],
      [/"/, { token: 'attribute.value', next: '@doubleString' }],
      [/'/, { token: 'attribute.value', next: '@singleString' }],
      [/{/, { token: 'delimiter.bracket', next: '@jsxAttributeValue' }],
    ],
    closingTag: [
      [/([A-Za-z_$][A-Za-z$]*)/, { cases: { '[A-Z$][\\w$]*': 'tag.custom', '@default': 'tag.dom' }, next: '@pop' }],
      [/>/, { token: 'delimiter.angle', next: '@pop' }],
    ],
    doubleString: [
      [/[^"]+/, 'attribute.value'],
      [/"/, { token: 'attribute.value', next: '@pop' }],
    ],
    singleString: [
      [/[^']+/, 'attribute.value'],
      [/'/, { token: 'attribute.value', next: '@pop' }],
    ],
    jsxAttributeValue: [
      [/{/, { token: 'delimiter.bracket', next: '@nestedJsxAttributeValue' }],
      [/}/, { token: 'delimiter.bracket', next: '@pop' }],
      [/(\w+)(?=[\s\n]*=)/, 'attribute.key'],
      [/[^{}]+/, 'attribute.key'],
    ],
    nestedJsxAttributeValue: [
      [/{/, { token: 'delimiter.bracket', next: '@nestedJsxAttributeValue' }],
      [/}/, { token: 'delimiter.bracket', next: '@pop' }],
      [/[^{}]+/, 'attribute.key'],
    ],
  },
};

/**
 * Modifies the tokenizer of a given language in a Monaco Editor instance with custom tokens.
 * The function operates in a non-destructive manner, ensuring the base object reference remains unaffected.
 *
 * How it works:
 * 1. Retrieves all the available language configurations from the Monaco Editor instance.
 * 2. Filters out the desired language (either 'typescript' or 'javascript').
 * 3. Executes the loader method, which is available for all registered languages, and retrieves the language model containing the tokenizer data.
 * 4. Modifies the tokenizer data with the custom tokens defined in `customTokenizer`.
 *
 * Note: The modifications are applied by prepending custom tokens to the existing tokenizer categories. If a category from `customTokenizer` does not exist in the language model, it is created.
 *
 * @param monacoEditor - The Monaco Editor instance from which to retrieve the language configurations.
 * @param language - The language to modify. Must be either 'typescript' or 'javascript'.
 */

export async function setupLanguage(monacoEditor: Monaco, language: 'typescript' | 'javascript') {
  const allLangs = monacoEditor.languages.getLanguages() as any;

  const { language: languageModel } = await allLangs.find(({ id }) => id === language).loader();

  for (const key in customTokenizer) {
    const value = customTokenizer[key];
    if (key === 'tokenizer') {
      for (const category in value) {
        const tokenDefs = value[category];
        // eslint-disable-next-line no-prototype-builtins
        if (!languageModel.tokenizer.hasOwnProperty(category)) {
          languageModel.tokenizer[category] = [];
        }
        if (Array.isArray(tokenDefs)) {
          // eslint-disable-next-line prefer-spread
          languageModel.tokenizer[category].unshift.apply(languageModel.tokenizer[category], tokenDefs);
        }
      }
    } else if (Array.isArray(value)) {
      // eslint-disable-next-line no-prototype-builtins
      if (!languageModel.hasOwnProperty(key)) {
        languageModel[key] = [];
      }
      // eslint-disable-next-line prefer-spread
      languageModel[key].unshift.apply(languageModel[key], value);
    }
  }
}
