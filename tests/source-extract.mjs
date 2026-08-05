import assert from 'node:assert/strict';

export function createFunctionExtractor(source) {
  return function extractFunction(name) {
    const starts = [`async function ${name}(`, `function ${name}(`];
    const start = starts.map(token => source.indexOf(token)).find(index => index >= 0);
    assert.notEqual(start, undefined, `missing production function: ${name}`);
    const paramsOpen = source.indexOf('(', start);
    assert.ok(paramsOpen >= 0, `missing function parameters: ${name}`);
    let paramsDepth = 0;
    let paramsClose = -1;
    let paramsMode = 'code';
    for (let index = paramsOpen; index < source.length; index++) {
      const char = source[index];
      const next = source[index + 1];
      if (paramsMode === 'line-comment') {
        if (char === '\n') paramsMode = 'code';
        continue;
      }
      if (paramsMode === 'block-comment') {
        if (char === '*' && next === '/') { paramsMode = 'code'; index += 1; }
        continue;
      }
      if (paramsMode === 'single' || paramsMode === 'double' || paramsMode === 'template') {
        const delimiter = paramsMode === 'single' ? "'" : paramsMode === 'double' ? '"' : '`';
        if (char === '\\') { index += 1; continue; }
        if (char === delimiter) paramsMode = 'code';
        continue;
      }
      if (char === '/' && next === '/') { paramsMode = 'line-comment'; index += 1; continue; }
      if (char === '/' && next === '*') { paramsMode = 'block-comment'; index += 1; continue; }
      if (char === "'") { paramsMode = 'single'; continue; }
      if (char === '"') { paramsMode = 'double'; continue; }
      if (char === '`') { paramsMode = 'template'; continue; }
      if (char === '(') paramsDepth += 1;
      if (char === ')') {
        paramsDepth -= 1;
        if (paramsDepth === 0) { paramsClose = index; break; }
      }
    }
    assert.ok(paramsClose >= 0, `unterminated function parameters: ${name}`);
    const open = source.indexOf('{', paramsClose + 1);
    assert.ok(open >= 0, `missing function body: ${name}`);
    let depth = 0;
    let mode = 'code';
    for (let index = open; index < source.length; index++) {
      const char = source[index];
      const next = source[index + 1];
      if (mode === 'line-comment') {
        if (char === '\n') mode = 'code';
        continue;
      }
      if (mode === 'block-comment') {
        if (char === '*' && next === '/') {
          mode = 'code';
          index += 1;
        }
        continue;
      }
      if (mode === 'single' || mode === 'double' || mode === 'template') {
        const delimiter = mode === 'single' ? "'" : mode === 'double' ? '"' : '`';
        if (char === '\\') {
          index += 1;
          continue;
        }
        if (char === delimiter) mode = 'code';
        continue;
      }
      if (char === '/' && next === '/') {
        mode = 'line-comment';
        index += 1;
        continue;
      }
      if (char === '/' && next === '*') {
        mode = 'block-comment';
        index += 1;
        continue;
      }
      if (char === "'") {
        mode = 'single';
        continue;
      }
      if (char === '"') {
        mode = 'double';
        continue;
      }
      if (char === '`') {
        mode = 'template';
        continue;
      }
      if (char === '{') depth += 1;
      if (char === '}') {
        depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
      }
    }
    assert.fail(`unterminated production function: ${name}`);
  };
}
