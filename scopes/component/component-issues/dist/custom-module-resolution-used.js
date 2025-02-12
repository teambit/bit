"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomModuleResolutionUsed = void 0;
const component_issue_1 = require("./component-issue");
class CustomModuleResolutionUsed extends component_issue_1.ComponentIssue {
    constructor() {
        super(...arguments);
        this.description = 'component is using an unsupported resolve-modules (aka aliases) feature';
        this.solution = 'replace to module paths';
        this.data = {};
    }
}
exports.CustomModuleResolutionUsed = CustomModuleResolutionUsed;
//# sourceMappingURL=custom-module-resolution-used.js.map