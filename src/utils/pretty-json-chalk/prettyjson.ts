// ### Module dependencies
import colors from 'chalk';

import Utils from './utils';

type Options = {
  emptyArrayMsg: string;
  keysColor: string;
  dashColor: string;
  numberColor: string;
  defaultIndentation: number;
  noColor: boolean;
  noAlign: boolean;
  inlineArrays?: any;
  stringColor: any;
};

const defaultOptions = {
  emptyArrayMsg: '(empty array)',
  keysColor: 'green',
  dashColor: 'green',
  numberColor: 'blue',
  defaultIndentation: 2,
  noColor: false,
  noAlign: false,
  stringColor: null,
};

// Helper function to detect if an object can be directly serializable
const isSerializable = function (input: any, onlyPrimitives: boolean, options: Options) {
  if (
    typeof input === 'boolean' ||
    typeof input === 'number' ||
    typeof input === 'function' ||
    input === null ||
    input instanceof Date
  ) {
    return true;
  }
  if (typeof input === 'string' && input.indexOf('\n') === -1) {
    return true;
  }

  if (options.inlineArrays && !onlyPrimitives) {
    if (Array.isArray(input) && isSerializable(input[0], true, options)) {
      return true;
    }
  }

  return false;
};

const addColorToData = function (input, options) {
  if (options.noColor) {
    return input;
  }

  if (typeof input === 'string') {
    // Print strings in regular terminal color
    return options.stringColor ? colors[options.stringColor](input) : input;
  }

  const sInput = `${input}`;

  if (input === true) {
    return colors.green(sInput);
  }
  if (input === false) {
    return colors.red(sInput);
  }
  if (input === null) {
    return colors.grey(sInput);
  }
  if (typeof input === 'number') {
    return colors[options.numberColor](sInput);
  }
  if (typeof input === 'function') {
    return 'function() {}';
  }

  if (Array.isArray(input)) {
    return input.join(', ');
  }

  return sInput;
};

const indentLines = function (string, spaces) {
  let lines = string.split('\n');
  lines = lines.map(function (line) {
    return Utils.indent(spaces) + line;
  });
  return lines.join('\n');
};

const renderToArray = function (data: any, options: Options = defaultOptions, indentation = 2) {
  if (isSerializable(data, false, options)) {
    return [Utils.indent(indentation) + addColorToData(data, options)];
  }

  // Unserializable string means it's multiline
  if (typeof data === 'string') {
    return [
      `${Utils.indent(indentation)}"""`,
      indentLines(data, indentation + options.defaultIndentation),
      `${Utils.indent(indentation)}"""`,
    ];
  }

  if (Array.isArray(data)) {
    // If the array is empty, render the `emptyArrayMsg`
    if (data.length === 0) {
      return [Utils.indent(indentation) + options.emptyArrayMsg];
    }

    const outputArray: any[] = [];

    data.forEach(function (element) {
      // Prepend the dash at the begining of each array's element line
      let line: any = '- ';
      if (!options.noColor) {
        line = colors[options.dashColor](line);
      }
      line = Utils.indent(indentation) + line;

      // If the element of the array is a string, bool, number, or null
      // render it in the same line
      if (isSerializable(element, false, options)) {
        line += renderToArray(element, options, 0)[0];
        outputArray.push(line);

        // If the element is an array or object, render it in next line
      } else {
        outputArray.push(line);

        // eslint-disable-next-line prefer-spread
        outputArray.push.apply(outputArray, renderToArray(element, options, indentation + options.defaultIndentation));
      }
    });

    return outputArray;
  }

  if (data instanceof Error) {
    return renderToArray(
      {
        message: data.message,
        // @ts-ignore
        stack: data.stack.split('\n'),
      },
      options,
      indentation
    );
  }

  // If values alignment is enabled, get the size of the longest index
  // to align all the values
  const maxIndexLength = options.noAlign ? 0 : Utils.getMaxIndexLength(data);
  let key;
  const output = [];

  Object.getOwnPropertyNames(data).forEach(function (i) {
    // Prepend the index at the beginning of the line
    key = `${i}: `;
    if (!options.noColor) {
      key = colors[options.keysColor](key);
    }
    key = Utils.indent(indentation) + key;

    // Skip `undefined`, it's not a valid JSON value.
    if (data[i] === undefined) {
      return;
    }

    // If the value is serializable, render it in the same line
    if (isSerializable(data[i], false, options)) {
      const nextIndentation = options.noAlign ? 0 : maxIndexLength - i.length;
      key += renderToArray(data[i], options, nextIndentation)[0];
      // @ts-ignore
      output.push(key);

      // If the index is an array or object, render it in next line
    } else {
      // @ts-ignore
      output.push(key);
      // eslint-disable-next-line prefer-spread
      output.push.apply(output, renderToArray(data[i], options, indentation + options.defaultIndentation));
    }
  });
  return output;
};

// ### Render function
// *Parameters:*
//
// * **`data`**: Data to render
// * **`options`**: Hash with different options to configure the parser
// * **`indentation`**: Base indentation of the parsed output
//
// *Example of options hash:*
//
//     {
//       emptyArrayMsg: '(empty)', // Rendered message on empty strings
//       keysColor: 'blue',        // Color for keys in hashes
//       dashColor: 'red',         // Color for the dashes in arrays
//       stringColor: 'grey',      // Color for strings
//       defaultIndentation: 2     // Indentation on nested objects
//     }

function render(data: any, options?: Options, indentation?: number): string {
  // Default values
  indentation = indentation || 0;
  options = Object.assign(defaultOptions, options);
  /* options.emptyArrayMsg = options.emptyArrayMsg || '(empty array)';
  options.keysColor = options.keysColor || 'green';
  options.dashColor = options.dashColor || 'green';
  options.numberColor = options.numberColor || 'blue';
  options.defaultIndentation = options.defaultIndentation || 2;
  options.noColor = !!options.noColor;
  options.noAlign = !!options.noAlign;

  options.stringColor = options.stringColor || null; */

  return renderToArray(data, options, indentation).join('\n');
}

// ### Render from string function
// *Parameters:*
//
// * **`data`**: Data to render as a string
// * **`options`**: Hash with different options to configure the parser
// * **`indentation`**: Base indentation of the parsed output
//
// *Example of options hash:*
//
//     {
//       emptyArrayMsg: '(empty)', // Rendered message on empty strings
//       keysColor: 'blue',        // Color for keys in hashes
//       dashColor: 'red',         // Color for the dashes in arrays
//       defaultIndentation: 2     // Indentation on nested objects
//     }
function renderString(data, options, indentation) {
  let output = '';
  let parsedData;
  // If the input is not a string or if it's empty, just return an empty string
  if (typeof data !== 'string' || data === '') {
    return '';
  }

  // Remove non-JSON characters from the beginning string
  if (data[0] !== '{' && data[0] !== '[') {
    let beginingOfJson;
    if (data.indexOf('{') === -1) {
      beginingOfJson = data.indexOf('[');
    } else if (data.indexOf('[') === -1) {
      beginingOfJson = data.indexOf('{');
    } else if (data.indexOf('{') < data.indexOf('[')) {
      beginingOfJson = data.indexOf('{');
    } else {
      beginingOfJson = data.indexOf('[');
    }
    output += `${data.substr(0, beginingOfJson)}\n`;
    data = data.substr(beginingOfJson);
  }

  try {
    parsedData = JSON.parse(data);
  } catch (e) {
    // Return an error in case of an invalid JSON
    return `${colors.red('Error:')} Not valid JSON!`;
  }

  // Call the real render() method
  output += exports.render(parsedData, options, indentation);
  return output;
}

export { render, renderString };
