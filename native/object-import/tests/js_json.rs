#[path = "../src/js_json.rs"]
pub mod js_json;

use std::{
    io::Write,
    process::{Command, Stdio},
};

use js_json::{Value, stringify};

fn next(seed: &mut u64) -> u64 {
    *seed ^= *seed << 13;
    *seed ^= *seed >> 7;
    *seed ^= *seed << 17;
    *seed
}

fn oracle(values: &[Value], pretty: bool) -> Vec<Option<String>> {
    let script = r"
const fs=require('node:fs');
function revive(n){switch(n.kind){
case 'undefined':return undefined;case 'null':return null;
case 'boolean':return n.value;
case 'number':return Buffer.from(n.value,'hex').readDoubleBE();
case 'string':return String.fromCharCode(...n.value);
case 'array':return n.value.map(revive);
case 'object':{const o={};for(const[k,v]of n.value)Object.defineProperty(o,String.fromCharCode(...k),{value:revive(v),enumerable:true,configurable:true,writable:true});return o;}
}}
const q=JSON.parse(fs.readFileSync(0,'utf8'));
process.stdout.write(JSON.stringify(q.values.map(v=>JSON.stringify(revive(v),null,q.pretty?2:undefined)??null)));
";
    let mut child = Command::new("node")
        .args(["-e", script])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    let request = serde_json::json!({"values":values,"pretty":pretty});
    child.stdin
        .take()
        .unwrap()
        .write_all(&serde_json::to_vec(&request).unwrap())
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success());
    serde_json::from_slice(&output.stdout).unwrap()
}

#[test]
fn seeded_binary64_utf16_and_own_keys_match_node_stringify() {
    let mut seed = 0xc019cafe1637_u64;
    let mut values = vec![
        Value::Undefined,
        Value::number(-0.0),
        Value::number(f64::NAN),
        Value::number(f64::INFINITY),
    ];
    for number in [1e-7, 1e-6, 1e20, 1e21, 1000000000000000100.0, f64::MIN_POSITIVE, f64::MAX] {
        values.push(Value::number(number));
    }
    for _ in 0..6000 {
        values.push(Value::number(f64::from_bits(next(&mut seed))));
    }
    for _ in 0..500 {
        let units = (0..24)
            .map(|_| next(&mut seed) as u16)
            .collect();
        values.push(Value::String(units));
    }
    values.push(Value::String(vec![
        0, 8, 9, 10, 12, 13, 34, 92, 0x2028, 0x2029, 0xd800, 0xd83d, 0xde00, 0xdc00,
    ]));
    for _ in 0..100 {
        let keys = ["4294967295", "2", "__proto__", "0", "01", "4294967294", "constructor", "1"];
        let fields = keys
            .iter()
            .map(|key| {
                (key.encode_utf16().collect(), Value::number(f64::from_bits(next(&mut seed))))
            })
            .collect();
        values.push(Value::Object(fields));
    }
    values.push(Value::Object(vec![
        (vec![97], Value::Undefined),
        (vec![98], Value::Array(vec![Value::Undefined, Value::Null, Value::Object(vec![])])),
    ]));
    for pretty in [false, true] {
        let expected = oracle(&values, pretty);
        for (index, (value, expected)) in values.iter().zip(expected).enumerate() {
            let actual = stringify(value, pretty)
                .unwrap()
                .map(|bytes| String::from_utf8(bytes).unwrap());
            assert_eq!(actual, expected, "case {index}, pretty={pretty}, {value:?}");
        }
    }
}

#[test]
fn truthiness_and_lodash_empty_distinguish_undefined_own_properties() {
    let object = Value::Object(vec![(vec![97], Value::Undefined)]);
    assert!(object.truthy().unwrap());
    assert!(!object.empty().unwrap());
    assert!(Value::Object(vec![]).empty().unwrap());
    assert!(!Value::number(f64::NAN).truthy().unwrap());
    assert!(!Value::number(-0.0).truthy().unwrap());
    assert!(Value::number(f64::INFINITY).truthy().unwrap());
}

#[test]
fn invalid_bits_duplicate_keys_and_deep_metadata_decline() {
    assert!(stringify(&Value::Number("wrong".to_owned()), false).is_err());
    let duplicate = Value::Object(vec![(vec![97], Value::Null), (vec![97], Value::Undefined)]);
    assert!(stringify(&duplicate, false).is_err());
    let mut deep = Value::Null;
    for _ in 0..66 {
        deep = Value::Array(vec![deep]);
    }
    assert!(stringify(&deep, false).is_err());
}
