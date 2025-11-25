// AST of 'import bar from "./bar";'
module.exports = {
  type: 'File',
  start: 0,
  end: 24,
  loc: {
    start: {
      line: 1,
      column: 0
    },
    end: {
      line: 1,
      column: 24
    }
  },
  program: {
    type: 'Program',
    start: 0,
    end: 24,
    loc: {
      start: {
        line: 1,
        column: 0
      },
      end: {
        line: 1,
        column: 24
      }
    },
    sourceType: 'module',
    body: [
      {
        type: 'ImportDeclaration',
        start: 0,
        end: 24,
        loc: {
          start: {
            line: 1,
            column: 0
          },
          end: {
            line: 1,
            column: 24
          }
        },
        specifiers: [
          {
            type: 'ImportDefaultSpecifier',
            start: 7,
            end: 10,
            loc: {
              start: {
                line: 1,
                column: 7
              },
              end: {
                line: 1,
                column: 10
              }
            },
            local: {
              type: 'Identifier',
              start: 7,
              end: 10,
              loc: {
                start: {
                  line: 1,
                  column: 7
                },
                end: {
                  line: 1,
                  column: 10
                }
              },
              name: 'bar'
            }
          }
        ],
        importKind: 'value',
        source: {
          type: 'StringLiteral',
          start: 16,
          end: 23,
          loc: {
            start: {
              line: 1,
              column: 16
            },
            end: {
              line: 1,
              column: 23
            }
          },
          extra: {
            rawValue: './bar',
            raw: '"./bar"'
          },
          value: './bar'
        }
      }
    ],
    directives: []
  },
  comments: [],
  tokens: [
    {
      type: {
        label: 'import',
        keyword: 'import',
        beforeExpr: false,
        startsExpr: false,
        rightAssociative: false,
        isLoop: false,
        isAssign: false,
        prefix: false,
        postfix: false,
        binop: null,
        updateContext: null
      },
      value: 'import',
      start: 0,
      end: 6,
      loc: {
        start: {
          line: 1,
          column: 0
        },
        end: {
          line: 1,
          column: 6
        }
      }
    },
    {
      type: {
        label: 'name',
        beforeExpr: false,
        startsExpr: true,
        rightAssociative: false,
        isLoop: false,
        isAssign: false,
        prefix: false,
        postfix: false,
        binop: null
      },
      value: 'bar',
      start: 7,
      end: 10,
      loc: {
        start: {
          line: 1,
          column: 7
        },
        end: {
          line: 1,
          column: 10
        }
      }
    },
    {
      type: {
        label: 'name',
        beforeExpr: false,
        startsExpr: true,
        rightAssociative: false,
        isLoop: false,
        isAssign: false,
        prefix: false,
        postfix: false,
        binop: null
      },
      value: 'from',
      start: 11,
      end: 15,
      loc: {
        start: {
          line: 1,
          column: 11
        },
        end: {
          line: 1,
          column: 15
        }
      }
    },
    {
      type: {
        label: 'string',
        beforeExpr: false,
        startsExpr: true,
        rightAssociative: false,
        isLoop: false,
        isAssign: false,
        prefix: false,
        postfix: false,
        binop: null,
        updateContext: null
      },
      value: './bar',
      start: 16,
      end: 23,
      loc: {
        start: {
          line: 1,
          column: 16
        },
        end: {
          line: 1,
          column: 23
        }
      }
    },
    {
      type: {
        label: ';',
        beforeExpr: true,
        startsExpr: false,
        rightAssociative: false,
        isLoop: false,
        isAssign: false,
        prefix: false,
        postfix: false,
        binop: null,
        updateContext: null
      },
      start: 23,
      end: 24,
      loc: {
        start: {
          line: 1,
          column: 23
        },
        end: {
          line: 1,
          column: 24
        }
      }
    },
    {
      type: {
        label: 'eof',
        beforeExpr: false,
        startsExpr: false,
        rightAssociative: false,
        isLoop: false,
        isAssign: false,
        prefix: false,
        postfix: false,
        binop: null,
        updateContext: null
      },
      start: 24,
      end: 24,
      loc: {
        start: {
          line: 1,
          column: 24
        },
        end: {
          line: 1,
          column: 24
        }
      }
    }
  ]
};
