//! Dependency parser and detector dispatch in the retained environment session.
use super::{Environments, Value, decline, io, json, text};
use std::path::Path;

impl Environments {
    pub(in crate::commands::status) fn parser(
        &mut self,
        root: &Path,
        target: &Value,
        files: &[String],
        custom: &Value,
    ) -> io::Result<Value> {
        if self.builtin_services == super::builtin::Services::Compiler {
            return crate::commands::compile_cmd::syntax::parse(root, target, files, custom);
        }
        if self.builtin_services != super::builtin::Services::Disabled {
            return Err(decline("component service dependency parser"));
        }
        let directory = root.join(text(target.get("directory"))?);
        let mut parsed = self.host(root)?.call("parseDependencies",&json!({"files":files.iter().map(|file|directory.join(file)).collect::<Vec<_>>(),"exclude":custom.as_object().map(|custom|custom.keys().collect::<Vec<_>>()).unwrap_or_default()}))?;
        if let Some(custom) = custom.as_object() {
            parsed
                .as_object_mut()
                .ok_or_else(|| decline("parser receipt"))?
                .extend(custom.clone());
        }
        Ok(parsed)
    }

    pub(in crate::commands::status) fn detectors(
        &mut self,
        root: &Path,
        context: &Value,
        target: &Value,
        files: &[String],
    ) -> io::Result<Value> {
        let identity = text(target.get("identity"))?;
        let env = context["environmentFacts"][identity]["envId"]
            .as_str()
            .unwrap_or("teambit.harmony/node");
        let bare_env = bit_install::policy::split_version(env).0;
        if self.builtin_services != super::builtin::Services::Disabled
            && bare_env == "teambit.react/react"
        {
            return Ok(Value::Null);
        }
        if (bare_env == "teambit.harmony/node" && context["environmentFacts"][identity].is_null())
            || context["environmentFacts"][identity]["nonLoaded"] == true
        {
            return Ok(Value::Null);
        }
        let directory = root.join(text(target.get("directory"))?);
        self.host(root)?.call("detectDependencies", &json!({"envId":env,"files":files.iter().map(|file|directory.join(file)).collect::<Vec<_>>(),"componentDir":directory,"aspectIds":context["environmentFacts"][identity]["aspectIds"]}))
    }
}
