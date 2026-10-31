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
    fn enter(&mut self) -> bool {
        self.nodes += 1;
        if !self.accepted || self.depth >= 128 || self.nodes > 16384 {
            self.accepted = false;
            return false;
        }
        self.depth += 1;
        true
    }
}
impl<'a> Visit<'a> for Proof {
    fn visit_statement(&mut self, node: &Statement<'a>) {
        if matches!(
            node,
            Statement::TSExportAssignment(_) | Statement::TSNamespaceExportDeclaration(_),
        ) {
            self.accepted = false;
            return;
        }
        if self.enter() {
            walk::walk_statement(self, node);
            self.depth -= 1;
        }
    }
    fn visit_jsx_element(&mut self, node: &JSXElement<'a>) {
        if self.enter() {
            walk::walk_jsx_element(self, node);
            self.depth -= 1;
        }
    }
    fn visit_jsx_fragment(&mut self, node: &JSXFragment<'a>) {
        if self.enter() {
            walk::walk_jsx_fragment(self, node);
            self.depth -= 1;
        }
    }
    fn visit_ts_type(&mut self, node: &TSType<'a>) {
        if self.enter() {
            walk::walk_ts_type(self, node);
            self.depth -= 1;
        }
    }
    fn visit_expression(&mut self, node: &Expression<'a>) {
        if self.enter() {
            walk::walk_expression(self, node);
            self.depth -= 1;
        }
    }
    fn visit_identifier_reference(&mut self, node: &IdentifierReference<'a>) {
        if matches!(node.name.as_str(), "module" | "exports" | "eval") {
            self.accepted = false;
        }
    }
    fn visit_variable_declarator(&mut self, node: &VariableDeclarator<'a>) {
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
