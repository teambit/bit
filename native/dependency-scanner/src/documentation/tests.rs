use super::proves_empty_docs;

#[test]
fn ordinary_commonjs_data_and_literal_dependency_modules_are_empty() {
    for source in [
        "module.exports = 42;",
        "'use strict'; const value = {name: 'ordinary', data: [1, true, null]}; module.exports=value;",
        "const dependency = require('./dependency'); module.exports = dependency;",
        "exports.settings = {enabled: true}; module.exports.other = require('other');",
        "// ordinary line comment\n/* ordinary block comment */ module.exports='data';",
    ] {
        assert!(proves_empty_docs(source.as_bytes(), "nested/index.js"), "{source}");
        assert!(proves_empty_docs(source.as_bytes(), "index.cjs"), "{source}");
    }
}

#[test]
fn documentation_and_react_component_shapes_always_defer() {
    for source in [
        "/** public description */ module.exports = 42;",
        "module.exports = '/** text inside a string */';",
        "module.exports = function Component() { return null; };",
        "module.exports = () => null;",
        "class Component extends React.Component {} module.exports=Component;",
        "module.exports = <div/>;",
        "module.exports = React.createClass({render() { return null; }});",
        "module.exports = memo(Component);",
        "module.exports = {get value() {return 1;}};",
        "@decorator class Component {}",
        "const {value = () => null} = object;",
    ] {
        assert!(!proves_empty_docs(source.as_bytes(), "index.js"), "{source}");
    }
}

#[test]
fn invalid_unsupported_and_nonliteral_modules_defer() {
    for source in [
        "module.exports = ;",
        "function incomplete(",
        "module.exports = require(name);",
        "module.exports = require.resolve('package');",
        "module.exports = {...other};",
        "import value from 'package'; export default value;",
        "if (flag) module.exports = 1;",
    ] {
        assert!(!proves_empty_docs(source.as_bytes(), "index.js"), "{source}");
    }
    for path in ["index.jsx", "index.ts", "data.json", "README.md", "extensionless"] {
        assert!(!proves_empty_docs(b"module.exports = 1;", path), "{path}");
    }
    assert!(!proves_empty_docs(&[0xff], "index.js"));
}
