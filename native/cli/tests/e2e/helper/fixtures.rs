//! `e2e-fixtures-helper.ts` and the command shortcuts the ported cases use for setup.
//! Setup runs on either CLI: only the command a case checks must run natively.

use super::Helper;

/// `fixtures.fooFixture`.
pub const FOO_FIXTURE: &str = "module.exports = function foo() { return 'got foo'; }";

impl Helper {
    /// `createComponentBarFoo(impl)`.
    pub fn create_component_bar_foo(&self, implementation: &str) {
        self.output_file("bar/foo.js", implementation);
    }

    /// `addComponentBarFoo()`.
    pub fn add_component_bar_foo(&self) {
        self.run("add bar -i bar/foo");
    }

    /// `tagComponentBarFoo()`.
    pub fn tag_component_bar_foo(&self) {
        self.tag_without_build("bar/foo", "");
    }

    /// `tagWithoutBuild(id, options)`: something must be tagged.
    pub fn tag_without_build(&self, id: &str, options: &str) -> String {
        let output = self.run(&format!("tag {id} {options}"));
        assert!(!output.contains("nothing to tag"), "{output}");
        output
    }

    /// `populateComponents(count, rewire, additionalStr)`: `compN/index.js`, each
    /// requiring the next, added, linked with `--rewire` and compiled.
    pub fn populate_components(&self, count: usize, rewire: bool, additional: &str) {
        for index in 1..=count {
            let content = if index == count {
                format!("module.exports = () => 'comp{index}{additional}';")
            } else {
                let next = format!("comp{}", index + 1);
                format!(
                    "const {next} = require('../{next}');\n\n\
                     module.exports = () => `comp{index}{additional} and ${{{next}()}}`;",
                )
            };
            self.output_file(&format!("comp{index}/index.js"), &content);
            self.run(&format!("add comp{index}"));
        }
        self.output_file("app.js", "const comp1 = require('./comp1');\nconsole.log(comp1())");
        if rewire {
            self.run("link --rewire");
        }
        self.run("compile");
    }
}
