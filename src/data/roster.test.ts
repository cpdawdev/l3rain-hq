import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEPARTMENTS, ROSTER, ROSTER_BY_ID } from './roster';

describe('roster invariants (spec: exactly 30, unique, one department each)', () => {
  it('has exactly 30 agents', () => {
    expect(ROSTER).toHaveLength(30);
  });

  it('has unique ids', () => {
    const ids = ROSTER.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique names', () => {
    const names = ROSTER.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('has unique cpd role slugs', () => {
    const roles = ROSTER.map((a) => a.cpdRole);
    expect(new Set(roles).size).toBe(roles.length);
  });

  it('assigns every agent exactly one valid department', () => {
    for (const agent of ROSTER) {
      expect(DEPARTMENTS).toContain(agent.department);
    }
  });

  it('covers all 7 departments', () => {
    const used = new Set(ROSTER.map((a) => a.department));
    expect(used.size).toBe(DEPARTMENTS.length);
  });

  it('indexes every agent by id with no duplicate instances', () => {
    expect(ROSTER_BY_ID.size).toBe(30);
    for (const agent of ROSTER) {
      expect(ROSTER_BY_ID.get(agent.id)).toBe(agent);
    }
  });

  it('matches docs/ROSTER.md row for row', () => {
    const md = fs.readFileSync(path.resolve(__dirname, '../../docs/ROSTER.md'), 'utf-8');
    const rows = md
      .split('\n')
      .filter((l) => l.startsWith('| ') && !l.startsWith('| id') && !l.startsWith('| ---'))
      .map((l) =>
        l
          .split('|')
          .map((c) => c.trim())
          .filter(Boolean),
      );
    expect(rows).toHaveLength(30);
    rows.forEach((row, i) => {
      const agent = ROSTER[i];
      expect(agent, `row ${String(i)}`).toBeDefined();
      expect(row[0]).toBe(agent?.id);
      expect(row[1]).toBe(agent?.name);
      expect(row[2]).toBe(agent?.role);
      expect(row[3]).toBe(agent?.department);
    });
  });
});
