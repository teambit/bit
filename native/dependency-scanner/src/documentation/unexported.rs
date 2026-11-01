//! A valid `CommonJS` source without exports cannot yield exported React component docs.
use oxc_ast::ast::{
    BindingPattern, ExportAllDeclaration, ExportDefaultDeclaration, ExportNamedDeclaration,
    Expression, IdentifierReference, JSXElement, JSXFragment, Program, Statement, TSType,
    VariableDeclarator,
};
use oxc_ast_visit::{Visit, walk};

pub(super) fn proven(program: &Program<'_>) -> bool {
    if program.body.is_empty() {
        return true;
    }
    let mut proof = Proof { accepted: true, depth: 0, nodes: 0 };
    proof.visit_program(program);
    proof.accepted
}
struct Proof {
    accepted: bool,
    depth: usize,
    nodes: usize,
}
impl Proof {
    fn walk_within(&mut self, step: impl FnOnce(&mut Self)) {
        self.nodes += 1;
        if !self.accepted || self.depth >= 128 || self.nodes > 16384 {
            self.accepted = false;
            return;
        }
        self.depth += 1;
        step(self);
        self.depth -= 1;
    }
}
impl<'a> Visit<'a> for Proof {
    fn visit_statement(&mut self, node: &Statement<'a>) {
        if !self.accepted {
            return;
        }
        if matches!(
            node,
            Statement::TSExportAssignment(_)
                | Statement::TSNamespaceExportDeclaration(_)
                | Statement::WithStatement(_),
        ) {
            self.accepted = false;
            return;
        }
        self.walk_within(|proof| walk::walk_statement(proof, node));
    }
    fn visit_jsx_element(&mut self, node: &JSXElement<'a>) {
        self.walk_within(|proof| walk::walk_jsx_element(proof, node));
    }
    fn visit_jsx_fragment(&mut self, node: &JSXFragment<'a>) {
        self.walk_within(|proof| walk::walk_jsx_fragment(proof, node));
    }
    fn visit_ts_type(&mut self, node: &TSType<'a>) {
        self.walk_within(|proof| walk::walk_ts_type(proof, node));
    }
    fn visit_expression(&mut self, node: &Expression<'a>) {
        self.walk_within(|proof| walk::walk_expression(proof, node));
    }
    fn visit_identifier_reference(&mut self, node: &IdentifierReference<'a>) {
        if matches!(node.name.as_str(), "module" | "exports" | "eval" | "globalThis" | "global") {
            self.accepted = false;
        }
    }
    fn visit_variable_declarator(&mut self, node: &VariableDeclarator<'a>) {
        if !self.accepted {
            return;
        }
        if !matches!(node.id, BindingPattern::BindingIdentifier(_)) {
            self.accepted = false;
            return;
        }
        walk::walk_variable_declarator(self, node);
    }
    fn visit_export_all_declaration(&mut self, _: &ExportAllDeclaration<'a>) {
        self.accepted = false;
    }
    fn visit_export_default_declaration(&mut self, _: &ExportDefaultDeclaration<'a>) {
        self.accepted = false;
    }
    fn visit_export_named_declaration(&mut self, _: &ExportNamedDeclaration<'a>) {
        self.accepted = false;
    }
}
