/** @Flow */
import { Doclet } from './parser';

export default function format(doc: Doclet): string {
  let args;
  let returns = '';
  let formattedDoc = `\nname: ${doc.name} \n`;

  if (doc.description) {
    formattedDoc += `description: ${doc.description}\n`;
  }

  if (doc.args && doc.args.length) {
    args = doc.args.map((arg) => {
      let formattedParam = `${arg.name}`;
      if (arg.type) {
        formattedParam += ` (${arg.type})`;
      }
      return formattedParam;
    }).join(', ');
    formattedDoc += `args: ${args}\n`;
  }
  if (doc.returns) {
    if (doc.returns.description) {
      returns = `${doc.returns.description} `;
    }

    if (doc.returns.type) {
      returns += `(${doc.returns.type})`;
    }

    if (returns) {
      formattedDoc += `returns: ${returns}\n`;
    }
  }

  return formattedDoc;
}
