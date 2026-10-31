use super::proves_empty_docs;

#[test]
fn unexported_test_callbacks_and_definitions_match_released_empty_documentation() {
    for source in [
        "describe('Example',()=>{it('works',()=>expect(2+2).toBe(4));it.skip('later',()=>{});it.todo('future');});",
        "describe('Example',()=>{it('works',()=>expect(2+2).toBe(5));});",
        "function Example() {return null;}",
        "const Example = () => null;",
        "class Example extends React.Component {render(){return null;}}",
        "if (flag) { call(); } for (let index=0;index<3;index++) { other(index); }",
        "async function example(){await Promise.resolve(42);}",
        "console.log(() => null);",
        "console.log(function Component() { return null; });",
        "console.log(...values);",
        "console['log']('value');",
        "console.log?.('value');",
        "@decorator class Component {}",
    ] {
        assert!(proves_empty_docs(source.as_bytes(), "example.spec.js"), "{source}");
    }
    assert!(!proves_empty_docs(b"/** documentation */ function Example() {}", "index.js"));
    assert!(!proves_empty_docs(b"exports.Example = () => null;", "index.js"));
}

#[test]
fn ordinary_commonjs_data_and_literal_dependency_modules_are_empty() {
    for source in [
        "module.exports = 42;",
        "console.log('v1');",
        "const value = require('example-package'); console.log(value);",
        "console.log({value:42}, [1,true]);",
        "module.exports = console.log('value');",
        "module.exports = () => 42;",
        "module.exports = () => { return 'text'; };",
        "module.exports = () => false;",
        "module.exports = require('inventory-dep') + 3;",
        "module.exports = (1 + 2) * 3 === 9;",
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
        "module.exports = async () => 42;",
        "module.exports = (props) => 'text';",
        "module.exports = (...props) => 'text';",
        "module.exports = () => { call(); return 'text'; };",
        "module.exports = () => { return null; };",
        "module.exports = 1 + (() => null);",
        "module.exports = 1 + function Component() {};",
        "module.exports = 1 + React.createClass({render() {return null;}});",
        "class Component extends React.Component {} module.exports=Component;",
        "module.exports = <div/>;",
        "module.exports = React.createClass({render() { return null; }});",
        "module.exports = memo(Component);",
        "module.exports = {get value() {return 1;}};",
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
    for path in ["data.json", "README.md", "extensionless", "data.snap"] {
        assert!(!proves_empty_docs(b"module.exports = 1;", path), "{path}");
    }
    assert!(!proves_empty_docs(&[0xff], "index.js"));
}

#[test]
fn typed_unexported_sources_and_literal_jest_snapshots_match_empty_documentation() {
    for kind in ["js", "cjs", "mjs", "jsx", "ts", "tsx", "mts", "cts"] {
        assert!(proves_empty_docs(b"module.exports = 1;", &format!("index.{kind}")));
    }
    assert!(proves_empty_docs(b"interface Example {value:number}; it('works',()=>{const item:Example={value:42}; expect(item.value).toBe(42);});", "index.spec.ts"));
    assert!(proves_empty_docs(
        b"const Example=()=> <div/>; it('works',()=>expect(2+2).toBe(4));",
        "index.spec.tsx"
    ));
    assert!(proves_empty_docs(
        b"// Jest Snapshot v1\nexports[`Example 1`] = `\nObject {\n  \"value\": 42,\n}\n`;\n",
        "index.spec.js.snap"
    ));
    assert!(!proves_empty_docs(b"exports[`Example ${value}`] = () => null;", "index.spec.js.snap"));
    assert!(!proves_empty_docs(
        b"exports[`Example 1`] = `/** documentation */`;",
        "index.spec.js.snap"
    ));
    assert!(!proves_empty_docs(b"const Example=()=>null; export = Example;", "index.ts"));
}
