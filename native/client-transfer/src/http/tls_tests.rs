//! A real mutual-TLS server requires the same configured certificate and key Node forwards.
//! Renew the 824-day leaf fixtures before 2029-01-18; macOS permits at most 825 days.
use super::{GlobalConfig, Network};
use serde_json::json;
use std::{
    io::{BufRead, BufReader},
    process::{Child, Command, Stdio},
};

struct Server(Child);
impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}
#[test]
fn network_certificate_and_legacy_proxy_fallback_authenticate_mutual_tls() {
    let root = tempfile::tempdir().unwrap();
    std::fs::write(root.path().join("cert.pem"), include_bytes!("fixtures/server-cert.pem"))
        .unwrap();
    std::fs::write(root.path().join("key.pem"), include_bytes!("fixtures/server-key.pem")).unwrap();
    std::fs::write(root.path().join("ca.pem"), include_bytes!("fixtures/ca.pem")).unwrap();
    let script = "const fs=require('fs');const cert=fs.readFileSync('cert.pem');require('https').createServer({cert,key:fs.readFileSync('key.pem'),ca:fs.readFileSync('ca.pem'),requestCert:true,rejectUnauthorized:true},(req,res)=>{req.resume();req.on('end',()=>res.end(JSON.stringify({authorized:req.socket.authorized})));}).listen(0,'127.0.0.1',function(){console.log(this.address().port);});";
    let child = Command::new("node")
        .args(["-e", script])
        .current_dir(root.path())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
        .unwrap();
    let mut server = Server(child);
    let mut port = String::new();
    BufReader::new(server.0.stdout.take().unwrap()).read_line(&mut port).unwrap();
    let url = format!("https://127.0.0.1:{}", port.trim());
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap();
    for prefix in ["network", "proxy"] {
        let global = GlobalConfig::from_iter([
            (format!("{prefix}.ca"), json!(include_str!("fixtures/ca.pem"))),
            (format!("{prefix}.cert"), json!(include_str!("fixtures/cert.pem"))),
            (format!("{prefix}.key"), json!(include_str!("fixtures/key.pem"))),
        ]);
        let network = Network::new(&global, "2.2.94", None, None).unwrap();
        assert_eq!(action(&network, &runtime, &url), json!({"authorized":true}));
    }
}

// Keep production error text canonical; only a failed fixture exposes reqwest's TLS source chain.
fn action(network: &Network, runtime: &tokio::runtime::Runtime, url: &str) -> serde_json::Value {
    runtime
        .block_on(network.action(url, "ExportValidate", &json!({})))
        .unwrap_or_else(|error| {
            let diagnostic = runtime.block_on(
                network.client
                    .post(format!("{url}/api/scope/action"))
                    .send(),
            );
            panic!("mutual TLS failed: {error}; underlying request: {diagnostic:?}");
        })
}
