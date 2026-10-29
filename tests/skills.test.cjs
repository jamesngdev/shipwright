'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SKILLS = path.join(__dirname, '..', 'skills');
const skills = fs.readdirSync(SKILLS).filter((d) => fs.existsSync(path.join(SKILLS, d, 'SKILL.md')));

function read(name) {
  return fs.readFileSync(path.join(SKILLS, name, 'SKILL.md'), 'utf8');
}

function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const out = {};
  if (m) for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

test('threat-model skill is present', () => {
  assert.ok(skills.includes('threat-model'));
});

for (const name of skills) {
  test(`${name}: name matches directory and description exists`, () => {
    const fm = frontmatter(read(name));
    assert.strictEqual(fm.name, name);
    assert.ok(fm.description, 'description missing');
  });

  test(`${name}: description ≤ 220 chars`, () => {
    assert.ok(frontmatter(read(name)).description.length <= 220);
  });

  test(`${name}: SKILL.md ≤ 120 lines`, () => {
    assert.ok(read(name).trimEnd().split('\n').length <= 120);
  });

  test(`${name}: reference links resolve`, () => {
    for (const m of read(name).matchAll(/\]\((references\/[^)#\s]+)\)/g)) {
      assert.ok(fs.existsSync(path.join(SKILLS, name, m[1])), `${name}: missing ${m[1]}`);
    }
  });
}
