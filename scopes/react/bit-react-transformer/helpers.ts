import * as t from '@babel/types';

export function isClassComponent(classDec: t.ClassDeclaration) {
  const renderMethod = classDec.body.body.find((classMember) => {
    if (classMember.type !== 'ClassMethod') return false;

    classMember as t.ClassMethod;
    if (classMember.key.type !== 'Identifier') return false;

    const key = classMember.key as t.Identifier;
    return key.name === 'render';
  }) as t.ClassMethod;

  return !!renderMethod;
}

export function isFunctionComponent(block: t.BlockStatement): boolean {
  if (block.type !== 'BlockStatement') return false;
  return true;
}

// // for future use:
// // check return value to identify react components.
// // does not work in dists

// function isJsxReturnValid(node?: t.Node) {
//     if (!node) return false;
//     if (node.type === "JSXElement") return true;
//     if (node.type === "ArrayExpression") {
//         const arrayExp = node as t.ArrayExpression;
//         return arrayExp.elements.every(elm => {
//             return elm?.type === "JSXElement";
//         });
//     }
//     return false;
// }

// function doesReturnJsx(block: t.BlockStatement): boolean {
//   return true;
//   // if (!block) return false;
//   // return !!block.body.find(statement => {
//   //     return (
//   //         statement.type === "ReturnStatement" &&
//   //         isJsxReturnValid(statement.argument || undefined)
//   //     );
//   // });
// }
