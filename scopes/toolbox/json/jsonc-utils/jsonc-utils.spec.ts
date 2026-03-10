import { expect } from 'chai';
import {
  detectJsoncFormatting,
  parseJsoncWithFormatting,
  stringifyJsonc,
  updateJsoncPreservingFormatting,
  type JsoncFormatting,
} from './jsonc-utils';

describe('jsonc-utils', () => {
  describe('detectJsoncFormatting', () => {
    it('should detect 2-space indentation', () => {
      const content = `{
  "foo": "bar"
}`;
      const formatting = detectJsoncFormatting(content);
      expect(formatting.indent).to.equal('  ');
    });

    it('should detect 4-space indentation', () => {
      const content = `{
    "foo": "bar"
}`;
      const formatting = detectJsoncFormatting(content);
      expect(formatting.indent).to.equal('    ');
    });

    it('should detect tab indentation', () => {
      const content = `{
\t"foo": "bar"
}`;
      const formatting = detectJsoncFormatting(content);
      expect(formatting.indent).to.equal('\t');
    });

    it('should detect LF newlines', () => {
      const content = '{\n  "foo": "bar"\n}';
      const formatting = detectJsoncFormatting(content);
      expect(formatting.newline).to.equal('\n');
    });

    it('should detect CRLF newlines', () => {
      const content = '{\r\n  "foo": "bar"\r\n}';
      const formatting = detectJsoncFormatting(content);
      expect(formatting.newline).to.equal('\r\n');
    });

    it('should use default 2-space indent when no indentation detected', () => {
      const content = '{"foo":"bar"}';
      const formatting = detectJsoncFormatting(content);
      expect(formatting.indent).to.equal('  ');
    });

    it('should use default LF newline when no newlines detected', () => {
      const content = '{"foo":"bar"}';
      const formatting = detectJsoncFormatting(content);
      expect(formatting.newline).to.equal('\n');
    });
  });

  describe('parseJsoncWithFormatting', () => {
    it('should parse valid JSONC with comments', () => {
      const content = `{
  // This is a comment
  "foo": "bar",
  /* Multi-line
     comment */
  "baz": 123
}`;
      const { data, formatting } = parseJsoncWithFormatting(content);
      expect(data.foo).to.equal('bar');
      expect(data.baz).to.equal(123);
      expect(formatting.indent).to.equal('  ');
      expect(formatting.newline).to.equal('\n');
    });

    it('should parse JSONC and detect formatting together', () => {
      const content = `{
    "name": "test",
    "version": "1.0.0"
}`;
      const { data, formatting } = parseJsoncWithFormatting(content);
      expect(data.name).to.equal('test');
      expect(data.version).to.equal('1.0.0');
      expect(formatting.indent).to.equal('    ');
    });

    it('should handle arrays in JSONC', () => {
      const content = `{
  "items": [1, 2, 3]
}`;
      const { data } = parseJsoncWithFormatting(content);
      expect(data.items).to.deep.equal([1, 2, 3]);
    });

    it('should handle nested objects', () => {
      const content = `{
  "outer": {
    "inner": "value"
  }
}`;
      const { data } = parseJsoncWithFormatting(content);
      expect(data.outer.inner).to.equal('value');
    });
  });

  describe('stringifyJsonc', () => {
    it('should stringify with 2-space indentation', () => {
      const data = { foo: 'bar', baz: 123 };
      const formatting: JsoncFormatting = { indent: '  ', newline: '\n' };
      const result = stringifyJsonc(data, formatting);
      expect(result).to.equal('{\n  "foo": "bar",\n  "baz": 123\n}');
    });

    it('should stringify with 4-space indentation', () => {
      const data = { foo: 'bar' };
      const formatting: JsoncFormatting = { indent: '    ', newline: '\n' };
      const result = stringifyJsonc(data, formatting);
      expect(result).to.equal('{\n    "foo": "bar"\n}');
    });

    it('should stringify with tab indentation', () => {
      const data = { foo: 'bar' };
      const formatting: JsoncFormatting = { indent: '\t', newline: '\n' };
      const result = stringifyJsonc(data, formatting);
      expect(result).to.equal('{\n\t"foo": "bar"\n}');
    });

    it('should stringify with LF newlines', () => {
      const data = { foo: 'bar' };
      const formatting: JsoncFormatting = { indent: '  ', newline: '\n' };
      const result = stringifyJsonc(data, formatting);
      expect(result).to.include('\n');
      expect(result).to.not.include('\r\n');
    });

    it('should stringify with CRLF newlines', () => {
      const data = { foo: 'bar' };
      const formatting: JsoncFormatting = { indent: '  ', newline: '\r\n' };
      const result = stringifyJsonc(data, formatting);
      expect(result).to.equal('{\r\n  "foo": "bar"\r\n}');
    });

    it('should handle nested objects with proper indentation', () => {
      const data = { outer: { inner: 'value' } };
      const formatting: JsoncFormatting = { indent: '  ', newline: '\n' };
      const result = stringifyJsonc(data, formatting);
      expect(result).to.equal('{\n  "outer": {\n    "inner": "value"\n  }\n}');
    });

    it('should handle arrays with proper formatting', () => {
      const data = { items: [1, 2, 3] };
      const formatting: JsoncFormatting = { indent: '  ', newline: '\n' };
      const result = stringifyJsonc(data, formatting);
      expect(result).to.include('[\n    1,\n    2,\n    3\n  ]');
    });
  });

  describe('updateJsoncPreservingFormatting', () => {
    it('should preserve 2-space indentation when updating', () => {
      const original = `{
  "foo": "bar",
  "baz": 123
}`;
      const updated = updateJsoncPreservingFormatting(original, (data: any) => {
        data.foo = 'updated';
        return data;
      });
      expect(updated).to.include('  "foo": "updated"');
      expect(updated).to.include('  "baz": 123');
    });

    it('should preserve 4-space indentation when updating', () => {
      const original = `{
    "foo": "bar"
}`;
      const updated = updateJsoncPreservingFormatting(original, (data: any) => {
        data.foo = 'updated';
        return data;
      });
      expect(updated).to.include('    "foo": "updated"');
    });

    it('should preserve tab indentation when updating', () => {
      const original = `{
\t"foo": "bar"
}`;
      const updated = updateJsoncPreservingFormatting(original, (data: any) => {
        data.foo = 'updated';
        return data;
      });
      expect(updated).to.include('\t"foo": "updated"');
    });

    it('should preserve LF newlines when updating', () => {
      const original = '{\n  "foo": "bar"\n}';
      const updated = updateJsoncPreservingFormatting(original, (data: any) => {
        data.foo = 'updated';
        return data;
      });
      expect(updated).to.include('\n');
      expect(updated).to.not.include('\r\n');
    });

    it('should preserve CRLF newlines when updating', () => {
      const original = '{\r\n  "foo": "bar"\r\n}';
      const updated = updateJsoncPreservingFormatting(original, (data: any) => {
        data.foo = 'updated';
        return data;
      });
      expect(updated).to.equal('{\r\n  "foo": "updated"\r\n}');
    });

    it('should preserve comments when updating', () => {
      const original = `{
  // Important comment
  "foo": "bar",
  /* Another comment */
  "baz": 123
}`;
      const updated = updateJsoncPreservingFormatting(original, (data: any) => {
        data.foo = 'updated';
        return data;
      });
      expect(updated).to.include('// Important comment');
      expect(updated).to.include('/* Another comment */');
      expect(updated).to.include('"foo": "updated"');
    });

    it('should handle updating nested objects', () => {
      const original = `{
  "outer": {
    "inner": "value"
  }
}`;
      const updated = updateJsoncPreservingFormatting(original, (data: any) => {
        data.outer.inner = 'updated';
        return data;
      });
      expect(updated).to.include('"inner": "updated"');
    });

    it('should handle updating arrays', () => {
      const original = `{
  "items": [1, 2, 3]
}`;
      const updated = updateJsoncPreservingFormatting(original, (data: any) => {
        data.items.push(4);
        return data;
      });
      expect(updated).to.include('4');
      const parsed = JSON.parse(updated.replace(/\/\/.*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''));
      expect(parsed.items).to.deep.equal([1, 2, 3, 4]);
    });

    it('should handle adding new fields', () => {
      const original = `{
  "foo": "bar"
}`;
      const updated = updateJsoncPreservingFormatting(original, (data: any) => {
        data.newField = 'newValue';
        return data;
      });
      expect(updated).to.include('"newField": "newValue"');
      expect(updated).to.include('"foo": "bar"');
    });

    it('should handle removing fields', () => {
      const original = `{
  "foo": "bar",
  "baz": 123,
  "qux": true
}`;
      const updated = updateJsoncPreservingFormatting(original, (data: any) => {
        delete data.baz;
        return data;
      });
      expect(updated).to.not.include('"baz"');
      expect(updated).to.include('"foo": "bar"');
      expect(updated).to.include('"qux": true');
    });

    it('should preserve formatting with complex nested structure', () => {
      const original = `{
  // Top-level comment
  "config": {
    "nested": {
      "deep": "value"
    },
    /* Inline comment */
    "array": [
      1,
      2,
      3
    ]
  },
  "version": "1.0.0"
}`;
      const updated = updateJsoncPreservingFormatting(original, (data: any) => {
        data.config.nested.deep = 'updated';
        data.config.array.push(4);
        return data;
      });
      expect(updated).to.include('// Top-level comment');
      expect(updated).to.include('/* Inline comment */');
      expect(updated).to.include('"deep": "updated"');
      expect(updated).to.include('  "config"');
    });

    it('should preserve formatting when no changes are made', () => {
      const original = `{
  // Comment
  "foo": "bar",
  "baz": 123
}`;
      const updated = updateJsoncPreservingFormatting(original, (data) => data);
      expect(updated).to.include('// Comment');
      expect(updated).to.include('  "foo": "bar"');
      expect(updated).to.include('  "baz": 123');
    });

    it('should handle mixed indentation levels in nested structures', () => {
      const original = `{
  "level1": {
    "level2": {
      "level3": "value"
    }
  }
}`;
      const updated = updateJsoncPreservingFormatting(original, (data: any) => {
        data.level1.level2.level3 = 'updated';
        data.level1.newProp = 'new';
        return data;
      });
      expect(updated).to.include('"level3": "updated"');
      expect(updated).to.include('"newProp": "new"');
    });
  });
});
