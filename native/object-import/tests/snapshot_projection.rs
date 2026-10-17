#[path = "../src/js_json.rs"]
pub mod js_json;
#[path = "../src/snapshot_projection.rs"]
pub mod snapshot_projection;

use std::process::Command;

use js_json::Value;

#[test]
fn real_default_versions_match_native_canonical_projection() {
    let Some(root) = std::env::var_os("BIT_TEST_SNAPSHOT_CLI") else {
        return;
    };
    let script = r"
const{createRequire}=require('node:module');const path=require('node:path');
const load=createRequire(path.join(process.argv[1],'package.json'));
const {Version}=load('@teambit/objects');
function ast(v){if(v===undefined)return{kind:'undefined'};if(v===null)return{kind:'null'};if(typeof v==='boolean')return{kind:'boolean',value:v};if(typeof v==='number'){const b=Buffer.alloc(8);b.writeDoubleBE(v);return{kind:'number',value:b.toString('hex')}};if(typeof v==='string')return{kind:'string',value:Array.from({length:v.length},(_,i)=>v.charCodeAt(i))};if(Array.isArray(v))return{kind:'array',value:v.map(ast)};return{kind:'object',value:Object.keys(v).map(k=>[ast(k).value,ast(v[k])])};}
let seed=0x4917;function next(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;}
const rows=[];
for(let i=0;i<250;i++){
 const n=next();const payload={files:[{file:'1'.repeat(40),relativePath:'index.js',name:'index.js',test:!!(n&1)}],mainFile:'index.js',log:{message:i%3?'message 😀\ud800':'',date:String(n),username:i%2?'user':undefined},dependencies:[],devDependencies:[],flattenedDependencies:[],extensions:[{name:'qualification/aspect',config:{'2':i,'1':n,z:undefined,a:[null,false,i]},data:{nested:{value:i}}}],packageDependencies:{'qualification':i%2?'^1.0.0':''},parents:i%2?['2'.repeat(40)]:[],hidden:i%3?false:true,bindingPrefix:i%4?'@bit':'',batchId:i%5?'batch':undefined};
 const v=Version.parse(JSON.stringify(payload),'3'.repeat(40));
 const fields={...v,files:v.files.map(f=>({...f,file:f.file.toString()})),dependencies:v.dependencies.dependencies.map(d=>({...d,id:d.id.serialize()})),devDependencies:v.devDependencies.dependencies.map(d=>({...d,id:d.id.serialize()})),flattenedDependencies:v.flattenedDependencies.map(d=>d.toObject()),extensions:v.extensions.map(e=>({extensionId:e.extensionId?.serialize(),rawConfig:e.rawConfig,data:e.data,legacyId:e.legacyId,name:e.name,newExtensionId:e.newExtensionId})),parents:v.parents.map(p=>p.toString())};
 rows.push({fields:ast(fields),body:JSON.stringify(v.toObject()),pretty:JSON.stringify(v.toObject(),null,2),semantic:v.id(),semanticHash:v.calculateHash().toString(),assignments:v.extensions.map(e=>ast(e.rawConfig))});
}
process.stdout.write(JSON.stringify(rows));
";
    let output = Command::new("node")
        .args(["-e", script])
        .arg(root)
        .output()
        .unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let rows: Vec<serde_json::Value> = serde_json::from_slice(&output.stdout).unwrap();
    for (index, row) in rows.iter().enumerate() {
        let fields: Value = serde_json::from_value(row["fields"].clone()).unwrap();
        for (pretty, name) in [(false, "body"), (true, "pretty")] {
            let bytes = snapshot_projection::serialize("Version", &fields, pretty).unwrap();
            assert_eq!(
                String::from_utf8(bytes).unwrap(),
                row[name].as_str().unwrap(),
                "Versioncase {index}",
            );
        }
        let semantic = snapshot_projection::semantic(&fields).unwrap();
        assert_eq!(String::from_utf8(semantic.bytes).unwrap(), row["semantic"].as_str().unwrap());
        assert_eq!(semantic.hash, row["semanticHash"].as_str().unwrap());
        for (source, config) in semantic.config_assignments {
            assert_eq!(serde_json::to_value(config).unwrap(), row["assignments"][source]);
        }
    }
}

#[test]
fn identities_preserve_preallocated_version_and_lane_hashes() {
    let fields = Value::Object(vec![
        ("name".encode_utf16().collect(), Value::text("component")),
        ("scope".encode_utf16().collect(), Value::text("qualification.scope")),
    ]);
    for kind in ["Version", "Lane"] {
        assert_eq!(
            snapshot_projection::identity(kind, &fields, Some(&"a".repeat(40))).unwrap(),
            "a".repeat(40),
        );
        assert!(snapshot_projection::identity(kind, &fields, None).is_err());
    }
    let scope = snapshot_projection::identity("Component", &fields, None).unwrap();
    assert_ne!(scope, snapshot_projection::identity("VersionHistory", &fields, None).unwrap());
}
