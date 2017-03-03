# js-docs parsing

Parsing the Docs yield useful information, such as the description of the component, its arguments, return type and usage examples. 
Other parts of the system, the Search, in particular, use that information for a better understanding what a component does.

The JS Docs get discovered by a Regex pattern, and parsing the docs is done by [Doctrine](https://github.com/eslint/doctrine).

An alternative for using a Regex that had been taken into account was parsing the implementation file, extracting the AST and finding the docs. 
While this method has some advantages, it requires special care for TypeScript, Flow and any other language/tool that needs compilation.
 
# advanced testing

working on it ...

# resolution algorithm

working on it ...

# component debugging

working on it ...
