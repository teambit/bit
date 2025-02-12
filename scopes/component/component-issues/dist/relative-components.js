"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RelativeComponents = void 0;
const component_issue_1 = require("./component-issue");
class RelativeComponents extends component_issue_1.ComponentIssue {
    constructor() {
        super(...arguments);
        this.description = 'components with relative import statements found';
        this.solution = 'use module paths for imported components';
        this.data = {};
        this.isCacheBlocker = false;
    }
    deserialize(data) {
        return (0, component_issue_1.deserializeWithBitId)(data);
    }
}
exports.RelativeComponents = RelativeComponents;
//# sourceMappingURL=relative-components.js.map