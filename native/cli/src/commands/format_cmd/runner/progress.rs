//! Formatter component-loading and per-component progress in released order.
pub(super) use crate::commands::workspace_command::component_service::Progress;
use bit_install::output::Output;
impl Progress {
    pub fn print(&self, output: &Output) {
        for count in &self.loads {
            if *count > 0 {
                output.status(&format!("loading {count} component(s)"));
            }
        }
        if self.identities.is_empty() {
            return;
        }
        output.status(&format!("formatting components (total: {})", self.identities.len()));
        for (index, id) in self.identities.iter().enumerate() {
            output.status(&format!(
                "formatting components ({}/{}) {id}",
                index + 1,
                self.identities.len(),
            ));
        }
    }
}
