module.exports = {
  type: 'Program',
  body: [
    {
      type: 'VariableDeclaration',
      declarations: [
        {
          type: 'VariableDeclarator',
          id: {
            type: 'Identifier',
            name: 'a'
          },
          init: {
            type: 'CallExpression',
            callee: {
              type: 'Identifier',
              name: 'require'
            },
            arguments: [
              {
                type: 'Literal',
                value: './a',
                raw: './a'
              }
            ]
          }
        }
      ],
      kind: 'var'
    }
  ]
};
