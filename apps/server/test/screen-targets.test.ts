import { describe, expect, it } from 'vitest';

import { parseScreenElements } from '../src/screen-targets.js';

describe('screen target parsing', () => {
  it('parses screen elements from raw JSON', () => {
    const elements = parseScreenElements(
      '{"elements":[{"label":"提交","role":"button","bounds":{"x":10,"y":20,"width":100,"height":40},"actionable":true,"confidence":0.91}]}',
    );

    expect(elements).toHaveLength(1);
    expect(elements[0]).toMatchObject({
      id: 'target-1',
      label: '提交',
      role: 'button',
      actionable: true,
      confidence: 0.91,
    });
  });

  it('parses fenced JSON and ignores invalid elements', () => {
    const elements = parseScreenElements(
      '```json\n{"elements":[{"label":"搜索框","role":"input","bounds":{"x":1,"y":2,"width":3,"height":4}},{"label":"","bounds":{"x":0,"y":0,"width":1,"height":1}}]}\n```',
    );

    expect(elements).toHaveLength(1);
    expect(elements[0].bounds).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });
});
