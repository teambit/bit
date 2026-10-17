use super::plan;
use serde_json::Value;
use std::process::Command;

#[test]
fn seeded_comparison_matches_actual_consumer_modified_policy() {
    let Some(root) = std::env::var_os("BIT_TEST_SNAPSHOT_CLI") else {
        return;
    };
    let script = r"
const{createRequire}=require('node:module'),path=require('node:path');const load=createRequire(path.join(process.argv[1],'package.json'));
const{Version}=load('@teambit/objects'),{Consumer}=load('@teambit/legacy.consumer'),{ConsumerComponent}=load('@teambit/legacy.consumer-component');
function ast(v){if(v===undefined)return{kind:'undefined'};if(v===null)return{kind:'null'};if(typeof v==='boolean')return{kind:'boolean',value:v};if(typeof v==='number'){const b=Buffer.alloc(8);b.writeDoubleBE(v);return{kind:'number',value:b.toString('hex')}};if(typeof v==='string')return{kind:'string',value:Array.from({length:v.length},(_,i)=>v.charCodeAt(i))};if(Array.isArray(v))return{kind:'array',value:v.map(ast)};return{kind:'object',value:Object.keys(v).map(k=>[ast(k).value,ast(v[k])])};}
function fields(v){return ast({mainFile:v.mainFile,files:v.files.map(f=>({...f,file:f.file.toString()})),log:v.log,dependencies:v.dependencies.dependencies.map(d=>({id:d.id.serialize()})),devDependencies:v.devDependencies.dependencies.map(d=>({id:d.id.serialize()})),extensions:v.extensions.map(e=>({extensionId:e.extensionId?.serialize(),name:e.name,legacyId:e.legacyId,rawConfig:e.rawConfig})),packageDependencies:v.packageDependencies,devPackageDependencies:v.devPackageDependencies,peerPackageDependencies:v.peerPackageDependencies,bindingPrefix:v.bindingPrefix,overrides:v.overrides});}
let seed=0x49da;function next(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;}
(async()=>{const rows=[];process.env.BIT_RUST_CLIENT_VCS='off';delete process.env.BIT_LOG;for(let i=0;i<400;i++){
 const n=next(),files=[{file:'1'.repeat(40),relativePath:'a.js',name:'a',test:true},{file:'2'.repeat(40),relativePath:'b.js',name:'b',test:false}];
 const payload={files,mainFile:'a.js',log:{message:'same',date:'1'},dependencies:[{id:{scope:'q.s',name:'z',version:'1.0.0'},relativePaths:[]},{id:{scope:'q.s',name:'a',version:'2.0.0'},relativePaths:[]}],devDependencies:[],extensions:[{name:'z/aspect',config:{z:2,a:1},data:{}},{name:'a/aspect',config:{n:3},data:{}}],packageDependencies:{z:'1.0.0',a:'2.0.0'},devPackageDependencies:{},peerPackageDependencies:{},parents:[]};
 const left=Version.parse(JSON.stringify(payload),'a'.repeat(40)),right=Version.parse(JSON.stringify(payload),'b'.repeat(40));
 if(n&32)right.dependencies.dependencies.reverse();if(n&64)right.dependencies.dependencies[0].id=right.dependencies.dependencies[0].id.changeVersion(undefined);if(n&1)right.files.reverse();if(n&2)right.extensions.reverse();if(n&4)right.files[0].name='deprecated';if(n&8)right.files[0].test=!right.files[0].test;if(n&16)right.packageDependencies.a='3.0.0';
 const request={mode:'modified',workspaceRoot:false,left:fields(left),right:fields(right)};
 const component=Object.create(ConsumerComponent.prototype);component.componentMap={rootDir:'component'};
 const consumer={scope:{sources:{consumerComponentToVersion:async()=>({version:right})}}};
 const sourceRequest={mode:'sourceCode',workspaceRoot:false,left:ast({files:left.files.map(f=>({...f,file:{hash:f.file.toString()}}))}),right:ast({files:right.files.map(f=>({...f,file:{hash:f.file.toString()}}))})};
 const sourceModified=await Consumer.prototype.isComponentSourceCodeModified.call(consumer,left,component);
 const modified=await Consumer.prototype.isComponentModified.call(consumer,left,component);
 rows.push({request,sourceRequest,sourceModified,modified,leftHash:left.calculateHash().toString(),rightHash:right.calculateHash().toString()});
}process.stdout.write(JSON.stringify(rows));})().catch(e=>{console.error(e);process.exitCode=1;});
";
    let output = Command::new("node")
        .args(["-e", script])
        .arg(root)
        .output()
        .unwrap();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let rows: Vec<Value> = serde_json::from_slice(&output.stdout).unwrap();
    for row in rows {
        let source = plan(row["sourceRequest"].clone()).unwrap();
        assert_eq!(source["modified"], row["sourceModified"]);
        let result = plan(row["request"].clone()).unwrap();
        assert_eq!(result["modified"], row["modified"]);
        assert_eq!(result["leftHash"], row["leftHash"]);
        assert_eq!(result["rightHash"], row["rightHash"]);
    }
}
