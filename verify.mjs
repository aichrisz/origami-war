#!/usr/bin/env node
// ORIGAMI//WAR - dependency-free Node test suite.
// Run: node verify.mjs
// Exits 0 only if every test and property sweep passes.

import * as E from './engine.mjs';
import { readFileSync, readdirSync } from 'node:fs';

// ---------------------------------------------------------------- harness
let passed = 0;
let failed = 0;
const failures = [];
const counters = Object.create(null);

function bump(key, n = 1) {
  counters[key] = (counters[key] || 0) + n;
}

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    failures.push({ name, message: err && err.message ? err.message : String(err) });
  }
}

function fail(msg) {
  throw new Error(msg);
}

function ok(cond, msg) {
  if (!cond) fail(msg || 'expected truthy value');
}

function eq(actual, expected, msg) {
  if (actual !== expected) {
    fail((msg ? msg + ': ' : '') + 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
  }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stable(value[key]);
    return out;
  }
  if (typeof value === 'number' && Number.isNaN(value)) return '__NaN__';
  return value;
}

function deepEq(actual, expected, msg) {
  const a = JSON.stringify(stable(actual));
  const b = JSON.stringify(stable(expected));
  if (a !== b) {
    fail((msg ? msg + ': ' : '') + 'deep mismatch\n  expected ' + b + '\n  actual   ' + a);
  }
}

function throws(fn, msg) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) fail(msg || 'expected function to throw');
}

// ------------------------------------------------- slice 1: legal creases
test('paper is a 5x5 grid of 25 immutable cell ids', () => {
  eq(E.PAPER, 5);
  const seen = new Set();
  for (let py = 0; py < 5; py++) {
    for (let px = 0; px < 5; px++) {
      const id = E.cellId(px, py);
      ok(!seen.has(id), 'cell id must be unique');
      seen.add(id);
      deepEq(E.paperOf(id), { px, py }, 'paperOf round-trip');
    }
  }
  eq(seen.size, 25);
});

test('initial topology places every cell at its paper coordinate, face up, unique rank', () => {
  const cells = E.initialTopology();
  eq(cells.length, 25);
  const ranks = new Set();
  for (const cell of cells) {
    const { px, py } = E.paperOf(cell.id);
    eq(cell.x, px, 'screen x mirrors paper x initially');
    eq(cell.y, py, 'screen y mirrors paper y initially');
    eq(cell.face, 0, 'all cells start face 0');
    ok(Number.isInteger(cell.rank), 'rank is an integer');
    ok(!ranks.has(cell.rank), 'rank is globally unique');
    ranks.add(cell.rank);
  }
});

test('occupiedBounds reports the occupied screen band', () => {
  deepEq(E.occupiedBounds(E.initialTopology()), { minX: 0, maxX: 4, minY: 0, maxY: 4 });
  const narrow = [
    { id: 0, x: 1, y: 2, face: 0, rank: 0 },
    { id: 1, x: 3, y: 2, face: 0, rank: 1 },
    { id: 2, x: 2, y: 4, face: 0, rank: 2 },
  ];
  deepEq(E.occupiedBounds(narrow), { minX: 1, maxX: 3, minY: 2, maxY: 4 });
});

test('legalCreases returns integer creases strictly between the occupied bands', () => {
  const cells = E.initialTopology();
  deepEq(E.legalCreases(cells, 'x'), [1, 2, 3, 4]);
  deepEq(E.legalCreases(cells, 'y'), [1, 2, 3, 4]);
});

test('legalCreases narrows with the occupied band and is empty for a single band', () => {
  const band = [
    { id: 0, x: 2, y: 1, face: 0, rank: 0 },
    { id: 1, x: 3, y: 1, face: 0, rank: 1 },
    { id: 2, x: 4, y: 1, face: 0, rank: 2 },
  ];
  deepEq(E.legalCreases(band, 'x'), [3, 4], 'creases sit between occupied columns');
  deepEq(E.legalCreases(band, 'y'), [], 'a single occupied row admits no crease');
});

test('legalCreases rejects an unknown axis', () => {
  throws(() => E.legalCreases(E.initialTopology(), 'z'), 'unknown axis must throw');
});

// -------------------------------------------- slice 2: coordinate reflection
test('reflect mirrors a coordinate across the crease line', () => {
  // crease 3 is the line between band 2 and band 3, i.e. at 2.5
  eq(E.reflect(0, 3), 5);
  eq(E.reflect(1, 3), 4);
  eq(E.reflect(2, 3), 3);
  eq(E.reflect(3, 3), 2);
  eq(E.reflect(4, 3), 1);
  eq(E.reflect(5, 3), 0);
});

test('reflect is an involution for every crease in range', () => {
  for (let c = -3; c <= 8; c++) {
    for (let v = -5; v <= 10; v++) {
      eq(E.reflect(E.reflect(v, c), c), v, 'reflect twice is identity');
      bump('reflect_involution_checks');
    }
  }
});

test('reflect swaps the two sides of the crease', () => {
  for (let c = 1; c <= 4; c++) {
    for (let v = 0; v <= 4; v++) {
      const r = E.reflect(v, c);
      ok((v < c) === (r >= c), 'low side maps to high side and back');
    }
  }
});

test('flapCellIds selects the whole moving side of the crease', () => {
  const cells = E.initialTopology();
  const low = E.flapCellIds(cells, 'x', 3, 'low');
  const high = E.flapCellIds(cells, 'x', 3, 'high');
  eq(low.length, 15, 'columns 0..2 move on a low flap');
  eq(high.length, 10, 'columns 3..4 move on a high flap');
  ok(low.every((id) => cells[id].x < 3), 'low flap is strictly below the crease');
  ok(high.every((id) => cells[id].x >= 3), 'high flap is at or above the crease');
  deepEq(low, [...low].sort((a, b) => a - b), 'flap ids are returned in ascending id order');
  const rowFlap = E.flapCellIds(cells, 'y', 1, 'low');
  eq(rowFlap.length, 5, 'row 0 alone moves on a y/1/low flap');
});

test('flapCellIds validates axis and direction', () => {
  const cells = E.initialTopology();
  throws(() => E.flapCellIds(cells, 'z', 2, 'low'), 'bad axis');
  throws(() => E.flapCellIds(cells, 'x', 2, 'sideways'), 'bad direction');
});

// --------------------------------------- slice 3: layer order & orientation
function cellsFrom(spec) {
  // spec: [ [id, x, y, face, rank], ... ] padded to 25 cells parked off-grid
  const cells = [];
  for (const [id, x, y, face, rank] of spec) cells.push({ id, x, y, face, rank });
  return cells;
}

test('stackAt lists a stack strictly bottom-to-top by rank', () => {
  const cells = cellsFrom([
    [0, 1, 1, 0, 7],
    [1, 1, 1, 1, 2],
    [2, 1, 1, 0, 5],
    [3, 2, 1, 0, 0],
  ]);
  deepEq(E.stackAt(cells, 1, 1), [1, 2, 0], 'ordered by ascending rank');
  deepEq(E.stackAt(cells, 2, 1), [3]);
  deepEq(E.stackAt(cells, 4, 4), [], 'empty screen coordinate');
});

test('stacksOf enumerates every occupied stack in canonical row-major order', () => {
  const cells = cellsFrom([
    [0, 2, 3, 0, 1],
    [1, 0, 0, 0, 0],
    [2, 2, 3, 1, 9],
    [3, 1, 0, 0, 4],
  ]);
  deepEq(E.stacksOf(cells), [
    { x: 0, y: 0, ids: [1] },
    { x: 1, y: 0, ids: [3] },
    { x: 2, y: 3, ids: [0, 2] },
  ]);
});

test('relayer lifts the moving cells above every stationary layer', () => {
  const cells = cellsFrom([
    [0, 0, 0, 0, 0],
    [1, 1, 0, 0, 1],
    [2, 2, 0, 0, 2],
  ]);
  const next = E.relayer(cells, [1]);
  const stationary = next.filter((c) => c.id !== 1).map((c) => c.rank);
  eq(next.find((c) => c.id === 1).rank > Math.max(...stationary), true, 'mover ends on top globally');
  deepEq(
    next.filter((c) => c.id !== 1).sort((a, b) => a.rank - b.rank).map((c) => c.id),
    [0, 2],
    'stationary relative order is preserved',
  );
});

test('relayer reverses bottom-to-top order inside every moving stack', () => {
  // two stacks of three; the whole left stack moves
  const cells = cellsFrom([
    [0, 0, 0, 0, 0],
    [1, 0, 0, 0, 1],
    [2, 0, 0, 0, 2],
    [3, 1, 0, 0, 3],
    [4, 1, 0, 0, 4],
  ]);
  const next = E.relayer(cells, [0, 1, 2]);
  deepEq(E.stackAt(next, 0, 0), [2, 1, 0], 'moving stack is flipped');
  deepEq(E.stackAt(next, 1, 0), [3, 4], 'stationary stack keeps its order');
  const movers = next.filter((c) => [0, 1, 2].includes(c.id)).map((c) => c.rank);
  const rest = next.filter((c) => ![0, 1, 2].includes(c.id)).map((c) => c.rank);
  ok(Math.min(...movers) > Math.max(...rest), 'every mover outranks every stationary cell');
});

test('relayer reverses several moving stacks simultaneously and independently', () => {
  const cells = cellsFrom([
    [0, 0, 0, 0, 0],
    [1, 0, 0, 0, 3],
    [2, 1, 0, 0, 1],
    [3, 1, 0, 0, 4],
    [4, 2, 0, 0, 2],
  ]);
  const next = E.relayer(cells, [0, 1, 2, 3]);
  deepEq(E.stackAt(next, 0, 0), [1, 0]);
  deepEq(E.stackAt(next, 1, 0), [3, 2]);
  deepEq(E.stackAt(next, 2, 0), [4], 'stationary untouched');
});

test('relayer toggles the face of moved cells only', () => {
  const cells = cellsFrom([
    [0, 0, 0, 0, 0],
    [1, 1, 0, 1, 1],
    [2, 2, 0, 0, 2],
  ]);
  const next = E.relayer(cells, [0, 1]);
  eq(next.find((c) => c.id === 0).face, 1, 'face 0 becomes 1');
  eq(next.find((c) => c.id === 1).face, 0, 'face 1 becomes 0');
  eq(next.find((c) => c.id === 2).face, 0, 'stationary face untouched');
});

test('relayer compacts ranks into a dense globally unambiguous total order', () => {
  const cells = E.initialTopology();
  const next = E.relayer(cells, [3, 4, 8, 9]);
  const ranks = next.map((c) => c.rank).sort((a, b) => a - b);
  deepEq(ranks, ranks.map((_, i) => i), 'ranks are exactly 0..24 with no gaps or ties');
});

test('relayer does not mutate its input', () => {
  const cells = E.initialTopology();
  const snapshot = JSON.stringify(cells);
  E.relayer(cells, [0, 1, 2]);
  eq(JSON.stringify(cells), snapshot, 'input cells are untouched');
});

// ------------------------------------------------- slice 4: fold mutation
test('a fold is legal only when the reflected flap fits the stationary box and touches it', () => {
  const cells = E.initialTopology();
  deepEq(E.checkFold(cells, { axis: 'x', crease: 1, direction: 'low' }), { ok: true });
  deepEq(E.checkFold(cells, { axis: 'x', crease: 4, direction: 'high' }), { ok: true });
  eq(E.checkFold(cells, { axis: 'x', crease: 3, direction: 'low' }).ok, false, 'flap overshoots the stationary box');
  eq(
    E.checkFold(cells, { axis: 'x', crease: 3, direction: 'low' }).reason,
    'flap-outside-stationary-box',
  );
  eq(E.checkFold(cells, { axis: 'x', crease: 1, direction: 'high' }).reason, 'flap-outside-stationary-box');
});

test('a crease outside the occupied band is rejected', () => {
  const cells = E.initialTopology();
  eq(E.checkFold(cells, { axis: 'x', crease: 0, direction: 'low' }).reason, 'crease-outside-occupied-band');
  eq(E.checkFold(cells, { axis: 'x', crease: 5, direction: 'low' }).reason, 'crease-outside-occupied-band');
  eq(E.checkFold(cells, { axis: 'y', crease: -1, direction: 'high' }).reason, 'crease-outside-occupied-band');
});

test('a malformed fold descriptor is rejected without throwing', () => {
  const cells = E.initialTopology();
  eq(E.checkFold(cells, { axis: 'z', crease: 2, direction: 'low' }).reason, 'bad-axis');
  eq(E.checkFold(cells, { axis: 'x', crease: 2, direction: 'up' }).reason, 'bad-direction');
  eq(E.checkFold(cells, { axis: 'x', crease: 1.5, direction: 'low' }).reason, 'bad-crease');
  eq(E.checkFold(cells, null).reason, 'bad-fold');
});

test('legalFolds on the flat sheet is exactly the eight self-covering folds', () => {
  deepEq(E.legalFolds(E.initialTopology()), [
    { axis: 'x', crease: 1, direction: 'low' },
    { axis: 'x', crease: 2, direction: 'low' },
    { axis: 'x', crease: 3, direction: 'high' },
    { axis: 'x', crease: 4, direction: 'high' },
    { axis: 'y', crease: 1, direction: 'low' },
    { axis: 'y', crease: 2, direction: 'low' },
    { axis: 'y', crease: 3, direction: 'high' },
    { axis: 'y', crease: 4, direction: 'high' },
  ]);
});

test('foldCells reflects coordinates, toggles faces and stacks the flap on top', () => {
  const before = E.initialTopology();
  const after = E.foldCells(before, { axis: 'x', crease: 4, direction: 'high' });
  eq(after.length, 25, 'no cell is lost or duplicated');
  deepEq(E.occupiedBounds(after), { minX: 0, maxX: 3, minY: 0, maxY: 4 });
  for (let y = 0; y < 5; y++) {
    const moved = after.find((c) => c.id === E.cellId(4, y));
    eq(moved.x, 3, 'column 4 reflects onto column 3');
    eq(moved.y, y, 'the other axis is unchanged');
    eq(moved.face, 1, 'moved cells show their other face');
    deepEq(E.stackAt(after, 3, y), [E.cellId(3, y), E.cellId(4, y)], 'flap lands above the stationary layer');
  }
  eq(after.filter((c) => c.face === 0).length, 20, 'only the flap flipped');
});

test('foldCells flips a multi-layer flap so the covered layer surfaces', () => {
  let cells = E.foldCells(E.initialTopology(), { axis: 'x', crease: 4, direction: 'high' });
  cells = E.foldCells(cells, { axis: 'x', crease: 3, direction: 'high' });
  // column 3 held [cell(3,y) bottom, cell(4,y) top]; flipped onto column 2
  for (let y = 0; y < 5; y++) {
    deepEq(
      E.stackAt(cells, 2, y),
      [E.cellId(2, y), E.cellId(4, y), E.cellId(3, y)],
      'the flap inverts as it folds over',
    );
    eq(cells.find((c) => c.id === E.cellId(4, y)).face, 0, 'twice-moved cell is face 0 again');
    eq(cells.find((c) => c.id === E.cellId(3, y)).face, 1, 'once-moved cell shows face 1');
  }
});

test('foldCells refuses an illegal fold and never mutates the input', () => {
  const before = E.initialTopology();
  const snapshot = JSON.stringify(before);
  throws(() => E.foldCells(before, { axis: 'x', crease: 3, direction: 'low' }), 'illegal fold throws');
  eq(JSON.stringify(before), snapshot, 'input topology is untouched after a rejected fold');
  const after = E.foldCells(before, { axis: 'y', crease: 1, direction: 'low' });
  eq(JSON.stringify(before), snapshot, 'input topology is untouched after a legal fold too');
  ok(after !== before, 'fold returns a new topology');
});

test('every legal fold keeps all 25 cell ids exactly once inside the sheet', () => {
  let cells = E.initialTopology();
  for (const fold of [
    { axis: 'x', crease: 1, direction: 'low' },
    { axis: 'y', crease: 4, direction: 'high' },
    { axis: 'x', crease: 2, direction: 'low' },
  ]) {
    cells = E.foldCells(cells, fold);
    deepEq(cells.map((c) => c.id).sort((a, b) => a - b), Array.from({ length: 25 }, (_, i) => i));
    const ranks = cells.map((c) => c.rank).sort((a, b) => a - b);
    deepEq(ranks, ranks.map((_, i) => i), 'ranks stay a dense total order');
    bump('fold_mutation_checks');
  }
});

// --------------------------------------- slice 5: fold/unfold deep round-trip
function topologyState() {
  return {
    cells: E.initialTopology(),
    units: [
      { id: 'A', owner: 'V', kind: 'CORE', cell: E.cellId(2, 0), alive: true, integrity: 2 },
      { id: 'B', owner: 'V', kind: 'BLADE', cell: E.cellId(0, 1), alive: true, integrity: 0 },
      { id: 'E', owner: 'I', kind: 'CORE', cell: E.cellId(2, 4), alive: true, integrity: 2 },
      { id: 'F', owner: 'I', kind: 'BLADE', cell: E.cellId(4, 3), alive: true, integrity: 0 },
    ],
    history: [],
  };
}

test('deepEqual compares structurally, not by reference', () => {
  ok(E.deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }), 'equal structures');
  ok(!E.deepEqual({ a: 1 }, { a: 1, b: 2 }), 'extra key differs');
  ok(!E.deepEqual([1, 2, 3], [1, 3, 2]), 'array order matters');
  ok(!E.deepEqual({ rank: 3 }, { rank: 4 }), 'value difference detected');
  ok(E.deepEqual(null, null) && !E.deepEqual(null, {}), 'null handling');
});

test('foldState folds the topology and records the fold in history', () => {
  const before = topologyState();
  const after = E.foldState(before, { axis: 'x', crease: 4, direction: 'high' });
  eq(after.history.length, 1);
  eq(after.history[0].type, 'FOLD');
  eq(after.history[0].axis, 'x');
  eq(after.history[0].crease, 4);
  eq(after.history[0].direction, 'high');
  deepEq(E.occupiedBounds(after.cells), { minX: 0, maxX: 3, minY: 0, maxY: 4 });
  eq(before.history.length, 0, 'the source state is untouched');
  deepEq(after.units, before.units, 'folding never touches unit state');
});

test('fold history snapshots are deeply immutable', () => {
  const after = E.foldState(topologyState(), { axis: 'y', crease: 1, direction: 'low' });
  const record = after.history[0];
  ok(Object.isFrozen(record), 'record frozen');
  ok(Object.isFrozen(record.before), 'snapshot frozen');
  ok(Object.isFrozen(record.before.cells), 'snapshot cells frozen');
  ok(Object.isFrozen(record.before.cells[0]), 'snapshot cell frozen');
  ok(Object.isFrozen(record.before.units[0]), 'snapshot unit frozen');
  throws(() => {
    'use strict';
    record.before.cells[0].rank = 99;
  }, 'writing through a snapshot must fail');
});

test('unfold deep-restores the exact pre-fold topology', () => {
  const before = topologyState();
  for (const fold of E.legalFolds(before.cells)) {
    const folded = E.foldState(before, fold);
    ok(!E.deepEqual(folded.cells, before.cells), 'a fold really changes the topology');
    const back = E.unfold(folded);
    ok(E.deepEqual(back, before), 'unfold restores the pre-fold state exactly: ' + JSON.stringify(fold));
    bump('fold_unfold_roundtrips');
  }
});

test('unfold deep-restores per-cell game state that changed after the fold', () => {
  const before = topologyState();
  const folded = E.foldState(before, { axis: 'x', crease: 1, direction: 'low' });
  // simulate a capture and a core hit landing after the fold was committed
  const damaged = {
    ...folded,
    units: folded.units.map((u) =>
      u.id === 'F' ? { ...u, alive: false } : u.id === 'A' ? { ...u, integrity: 1 } : { ...u },
    ),
  };
  const back = E.unfold(damaged);
  ok(E.deepEqual(back.units, before.units), 'units are restored to their pre-fold values');
  ok(E.deepEqual(back.cells, before.cells), 'topology is restored too');
});

test('unfold is LIFO across a stack of folds', () => {
  const s0 = topologyState();
  const s1 = E.foldState(s0, { axis: 'x', crease: 1, direction: 'low' });
  const s2 = E.foldState(s1, { axis: 'y', crease: 4, direction: 'high' });
  const s3 = E.foldState(s2, { axis: 'x', crease: 2, direction: 'low' });
  ok(E.deepEqual(E.unfold(s3), s2), 'first unfold returns to s2');
  ok(E.deepEqual(E.unfold(E.unfold(s3)), s1), 'second unfold returns to s1');
  ok(E.deepEqual(E.unfold(E.unfold(E.unfold(s3))), s0), 'third unfold returns to s0');
});

test('unfold refuses an empty history or a non-fold top record', () => {
  throws(() => E.unfold(topologyState()), 'nothing to unfold');
  const bogus = { ...topologyState(), history: [Object.freeze({ type: 'STRIKE' })] };
  throws(() => E.unfold(bogus), 'top of history is not a fold');
});

test('foldState rejects an illegal fold with no mutation at all', () => {
  const before = topologyState();
  const snapshot = JSON.stringify(before);
  throws(() => E.foldState(before, { axis: 'x', crease: 3, direction: 'low' }));
  throws(() => E.foldState(before, { axis: 'q', crease: 3, direction: 'low' }));
  eq(JSON.stringify(before), snapshot, 'state untouched after rejection');
});

// ----------------------------------- slice 6: stack / orthogonal contact
test('cells in the same rendered stack are in contact', () => {
  const cells = E.foldCells(E.initialTopology(), { axis: 'x', crease: 4, direction: 'high' });
  ok(E.inContact(cells, E.cellId(3, 2), E.cellId(4, 2)), 'stacked cells touch');
  ok(E.inContact(cells, E.cellId(4, 2), E.cellId(3, 2)), 'contact is symmetric');
});

test('cells at orthogonally adjacent screen coordinates are in contact', () => {
  const cells = E.initialTopology();
  ok(E.inContact(cells, E.cellId(0, 0), E.cellId(1, 0)), 'east neighbour');
  ok(E.inContact(cells, E.cellId(2, 2), E.cellId(2, 1)), 'north neighbour');
  ok(!E.inContact(cells, E.cellId(0, 0), E.cellId(1, 1)), 'diagonal is not contact');
  ok(!E.inContact(cells, E.cellId(0, 0), E.cellId(2, 0)), 'distance two is not contact');
  ok(!E.inContact(cells, E.cellId(0, 0), E.cellId(0, 0)), 'a cell is not in contact with itself');
});

test('folding is what brings distant paper cells into contact', () => {
  const flat = E.initialTopology();
  ok(!E.inContact(flat, E.cellId(0, 0), E.cellId(4, 0)), 'opposite corners start far apart');
  let cells = E.foldCells(flat, { axis: 'x', crease: 4, direction: 'high' });
  cells = E.foldCells(cells, { axis: 'x', crease: 3, direction: 'high' });
  cells = E.foldCells(cells, { axis: 'x', crease: 2, direction: 'high' });
  cells = E.foldCells(cells, { axis: 'x', crease: 1, direction: 'high' });
  deepEq(E.occupiedBounds(cells), { minX: 0, maxX: 0, minY: 0, maxY: 4 });
  ok(E.inContact(cells, E.cellId(0, 0), E.cellId(4, 0)), 'four folds stack the whole row together');
});

test('contactCellIds lists the touching cells in ascending id order', () => {
  const cells = E.initialTopology();
  deepEq(E.contactCellIds(cells, E.cellId(0, 0)), [E.cellId(1, 0), E.cellId(0, 1)].sort((a, b) => a - b));
  deepEq(
    E.contactCellIds(cells, E.cellId(2, 2)),
    [E.cellId(2, 1), E.cellId(1, 2), E.cellId(3, 2), E.cellId(2, 3)].sort((a, b) => a - b),
  );
});

test('inContact rejects unknown cell ids', () => {
  throws(() => E.inContact(E.initialTopology(), 0, 25));
  throws(() => E.inContact(E.initialTopology(), -1, 0));
});

test('contactUnitIds finds live units in contact, never the unit itself', () => {
  const state = topologyState();
  // A at (2,0), B at (0,1), E at (2,4), F at (4,3): nothing touches on the flat sheet
  for (const id of ['A', 'B', 'E', 'F']) deepEq(E.contactUnitIds(state, id), [], 'flat sheet is peaceful');
  // rows 0 and 1 reflect onto rows 3 and 2, carrying vermilion into indigo's half
  const folded = E.foldState(state, { axis: 'y', crease: 2, direction: 'low' });
  eq(folded.cells.find((c) => c.id === E.cellId(2, 0)).y, 3, 'A rides row 0 onto row 3');
  deepEq(E.contactUnitIds(folded, 'A'), ['E'], 'A now touches the indigo core');
  deepEq(E.contactUnitIds(folded, 'E'), ['A'], 'contact is mutual');
  deepEq(E.contactUnitIds(folded, 'B'), [], 'B lands out of reach at (0,2)');
  const dead = { ...folded, units: folded.units.map((u) => (u.id === 'E' ? { ...u, alive: false } : u)) };
  deepEq(E.contactUnitIds(dead, 'A'), [], 'captured units are no longer in contact');
  deepEq(E.contactUnitIds(dead, 'E'), [], 'a captured unit has no contacts of its own');
});

// ------------------------------------- slice 7: strike legality & resolution
function strikeScenario(overrides = {}) {
  return {
    cells: E.initialTopology(),
    toMove: 'V',
    units: [
      { id: 'A', owner: 'V', kind: 'CORE', cell: E.cellId(0, 0), alive: true, integrity: 2 },
      { id: 'B', owner: 'V', kind: 'BLADE', cell: E.cellId(2, 2), alive: true, integrity: 0 },
      { id: 'C', owner: 'V', kind: 'BLADE', cell: E.cellId(1, 2), alive: true, integrity: 0 },
      { id: 'E', owner: 'I', kind: 'CORE', cell: E.cellId(4, 4), alive: true, integrity: 2 },
      { id: 'F', owner: 'I', kind: 'BLADE', cell: E.cellId(2, 3), alive: true, integrity: 0 },
    ],
    history: [],
    ...overrides,
  };
}

test('legalStrikes lists every live enemy in contact, canonically ordered', () => {
  const state = strikeScenario();
  deepEq(E.legalStrikes(state), [{ type: 'STRIKE', attacker: 'B', target: 'F' }]);
  deepEq(E.legalStrikes({ ...state, toMove: 'I' }), [{ type: 'STRIKE', attacker: 'F', target: 'B' }]);
});

test('legalStrikes is empty when nothing is in contact', () => {
  const state = strikeScenario({
    units: [
      { id: 'A', owner: 'V', kind: 'CORE', cell: E.cellId(0, 0), alive: true, integrity: 2 },
      { id: 'E', owner: 'I', kind: 'CORE', cell: E.cellId(4, 4), alive: true, integrity: 2 },
    ],
  });
  deepEq(E.legalStrikes(state), []);
});

test('checkStrike enforces ownership, life and contact', () => {
  const state = strikeScenario();
  deepEq(E.checkStrike(state, { type: 'STRIKE', attacker: 'B', target: 'F' }), { ok: true });
  eq(E.checkStrike(state, { type: 'STRIKE', attacker: 'F', target: 'B' }).reason, 'attacker-not-active-side');
  eq(E.checkStrike(state, { type: 'STRIKE', attacker: 'B', target: 'C' }).reason, 'target-not-enemy');
  eq(E.checkStrike(state, { type: 'STRIKE', attacker: 'C', target: 'F' }).reason, 'no-contact');
  eq(E.checkStrike(state, { type: 'STRIKE', attacker: 'B', target: 'B' }).reason, 'target-not-enemy');
  eq(E.checkStrike(state, { type: 'STRIKE', attacker: 'B', target: 'Z' }).reason, 'unknown-unit');
  eq(E.checkStrike(state, { type: 'STRIKE', attacker: 'B' }).reason, 'unknown-unit');
  eq(E.checkStrike(state, null).reason, 'bad-action');
  eq(E.checkStrike(state, { type: 'FOLD', attacker: 'B', target: 'F' }).reason, 'bad-action');
});

test('checkStrike refuses dead attackers and dead targets', () => {
  const state = strikeScenario();
  const deadAttacker = { ...state, units: state.units.map((u) => (u.id === 'B' ? { ...u, alive: false } : u)) };
  eq(E.checkStrike(deadAttacker, { type: 'STRIKE', attacker: 'B', target: 'F' }).reason, 'attacker-not-live');
  const deadTarget = { ...state, units: state.units.map((u) => (u.id === 'F' ? { ...u, alive: false } : u)) };
  eq(E.checkStrike(deadTarget, { type: 'STRIKE', attacker: 'B', target: 'F' }).reason, 'target-not-live');
});

test('a blade strike captures the blade and leaves the paper alone', () => {
  const state = strikeScenario();
  const after = E.strikeState(state, { type: 'STRIKE', attacker: 'B', target: 'F' });
  eq(E.unitById(after, 'F').alive, false, 'blade captured');
  eq(E.unitById(after, 'B').alive, true, 'attacker survives');
  ok(E.deepEqual(after.cells, state.cells), 'a strike never changes the topology');
  eq(E.unitById(state, 'F').alive, true, 'the source state is untouched');
  eq(after.history.length, 1);
  eq(after.history[0].type, 'STRIKE');
  eq(after.history[0].attacker, 'B');
  eq(after.history[0].target, 'F');
  ok(Object.isFrozen(after.history[0].before), 'strike history snapshot is immutable');
});

test('a core strike removes one integrity, and the second strike captures the core', () => {
  const contact = strikeScenario({
    units: [
      { id: 'A', owner: 'V', kind: 'CORE', cell: E.cellId(0, 0), alive: true, integrity: 2 },
      { id: 'B', owner: 'V', kind: 'BLADE', cell: E.cellId(2, 2), alive: true, integrity: 0 },
      { id: 'E', owner: 'I', kind: 'CORE', cell: E.cellId(2, 3), alive: true, integrity: 2 },
    ],
  });
  const once = E.strikeState(contact, { type: 'STRIKE', attacker: 'B', target: 'E' });
  eq(E.unitById(once, 'E').integrity, 1, 'integrity drops by exactly one');
  eq(E.unitById(once, 'E').alive, true, 'core survives the first hit');
  const twice = E.strikeState({ ...once, toMove: 'V' }, { type: 'STRIKE', attacker: 'B', target: 'E' });
  eq(E.unitById(twice, 'E').integrity, 0);
  eq(E.unitById(twice, 'E').alive, false, 'integrity 0 captures the core');
});

test('strikeState refuses an illegal strike with no mutation', () => {
  const state = strikeScenario();
  const snapshot = JSON.stringify(state);
  throws(() => E.strikeState(state, { type: 'STRIKE', attacker: 'C', target: 'F' }));
  throws(() => E.strikeState(state, { type: 'STRIKE', attacker: 'F', target: 'B' }));
  eq(JSON.stringify(state), snapshot, 'state untouched after rejection');
});

test('a strike is undoable by restoring its history snapshot', () => {
  const state = strikeScenario();
  const after = E.strikeState(state, { type: 'STRIKE', attacker: 'B', target: 'F' });
  ok(E.deepEqual(E.undoLast(after), state), 'undoLast restores the pre-strike state exactly');
});

// ------------------------------- slice 8: turn order, fold budget, termination
function manualGame(overrides = {}) {
  return {
    version: E.VERSION,
    seed: 1,
    mode: 'PASS',
    firstMover: 'V',
    cells: E.initialTopology(),
    units: [
      { id: 'A', owner: 'V', kind: 'CORE', cell: E.cellId(2, 0), alive: true, integrity: 2 },
      { id: 'B', owner: 'V', kind: 'BLADE', cell: E.cellId(0, 0), alive: true, integrity: 0 },
      { id: 'C', owner: 'V', kind: 'BLADE', cell: E.cellId(1, 1), alive: true, integrity: 0 },
      { id: 'D', owner: 'V', kind: 'BLADE', cell: E.cellId(3, 1), alive: true, integrity: 0 },
      { id: 'E', owner: 'I', kind: 'CORE', cell: E.cellId(2, 4), alive: true, integrity: 2 },
      { id: 'F', owner: 'I', kind: 'BLADE', cell: E.cellId(4, 4), alive: true, integrity: 0 },
      { id: 'G', owner: 'I', kind: 'BLADE', cell: E.cellId(3, 3), alive: true, integrity: 0 },
      { id: 'H', owner: 'I', kind: 'BLADE', cell: E.cellId(1, 3), alive: true, integrity: 0 },
    ],
    tokens: { V: 3, I: 3 },
    toMove: 'V',
    turn: 0,
    status: 'ACTIVE',
    outcome: null,
    reason: null,
    history: [],
    ...overrides,
  };
}

test('the rule constants are the settled ones', () => {
  eq(E.TURN_CAP, 24);
  eq(E.FOLD_TOKENS, 3);
  eq(E.CORE_INTEGRITY, 2);
  eq(E.BLADES_PER_SIDE, 3);
});

test('a committed fold spends one fold token and passes the turn', () => {
  const before = manualGame();
  const after = E.commitAction(before, { type: 'FOLD', axis: 'x', crease: 1, direction: 'low' });
  deepEq(after.tokens, { V: 2, I: 3 }, 'only the mover pays');
  eq(after.turn, 1);
  eq(after.toMove, 'I');
  eq(after.status, 'ACTIVE');
  eq(before.turn, 0, 'source state untouched');
});

test('a committed strike spends no fold token', () => {
  const contact = manualGame({
    units: manualGame().units.map((u) => (u.id === 'H' ? { ...u, cell: E.cellId(1, 2) } : u)),
  });
  const after = E.commitAction(contact, { type: 'STRIKE', attacker: 'C', target: 'H' });
  deepEq(after.tokens, { V: 3, I: 3 });
  eq(after.turn, 1);
  eq(after.toMove, 'I');
  eq(E.unitById(after, 'H').alive, false);
});

test('folds vanish from the legal action list once the tokens are gone', () => {
  const withTokens = manualGame();
  ok(E.legalActions(withTokens).some((a) => a.type === 'FOLD'), 'folds available at full budget');
  const spent = manualGame({ tokens: { V: 0, I: 3 } });
  ok(!E.legalActions(spent).some((a) => a.type === 'FOLD'), 'no folds without tokens');
  eq(E.checkAction(spent, { type: 'FOLD', axis: 'x', crease: 1, direction: 'low' }).reason, 'no-fold-tokens');
  throws(() => E.commitAction(spent, { type: 'FOLD', axis: 'x', crease: 1, direction: 'low' }));
});

test('each side gets exactly three folds across a match', () => {
  let state = manualGame();
  const folds = [
    { axis: 'x', crease: 1, direction: 'low' },
    { axis: 'y', crease: 1, direction: 'low' },
    { axis: 'x', crease: 2, direction: 'low' },
  ];
  for (let i = 0; i < 6; i++) {
    const legal = E.legalActions(state).filter((a) => a.type === 'FOLD');
    ok(legal.length > 0, 'a fold is still available at step ' + i);
    state = E.commitAction(state, legal[0]);
  }
  deepEq(state.tokens, { V: 0, I: 0 }, 'both budgets exhausted after six folds');
  ok(!E.legalActions(state).some((a) => a.type === 'FOLD'), 'no seventh fold');
  ok(folds.length === 3, 'three canonical folds exist for reference');
});

test('capturing a core ends the match immediately in favour of its captor', () => {
  const nearlyDead = manualGame({
    units: manualGame().units.map((u) => {
      if (u.id === 'E') return { ...u, cell: E.cellId(1, 2), integrity: 1 };
      return u;
    }),
  });
  const after = E.commitAction(nearlyDead, { type: 'STRIKE', attacker: 'C', target: 'E' });
  eq(after.status, 'DONE');
  eq(after.outcome, 'V');
  eq(after.reason, 'CORE');
  deepEq(E.legalActions(after), [], 'a finished match offers no actions');
  throws(() => E.commitAction(after, { type: 'FOLD', axis: 'x', crease: 1, direction: 'low' }), 'no play after the end');
});

test('a core still standing at integrity 1 does not end the match', () => {
  const contact = manualGame({
    units: manualGame().units.map((u) => (u.id === 'E' ? { ...u, cell: E.cellId(1, 2) } : u)),
  });
  const after = E.commitAction(contact, { type: 'STRIKE', attacker: 'C', target: 'E' });
  eq(after.status, 'ACTIVE');
  eq(E.unitById(after, 'E').integrity, 1);
});

test('the match stops at the 24 committed action cap', () => {
  // indigo core sits next to a vermilion blade: both sides always have a strike
  const state = manualGame({
    turn: 22,
    tokens: { V: 0, I: 0 },
    units: manualGame().units.map((u) => (u.id === 'E' ? { ...u, cell: E.cellId(1, 2) } : u)),
  });
  const one = E.commitAction(state, { type: 'STRIKE', attacker: 'C', target: 'E' });
  eq(one.turn, 23);
  eq(E.unitById(one, 'E').integrity, 1, 'the core survives, so play continues');
  eq(one.status, 'ACTIVE', 'action 23 of 24 keeps the match alive');
  const two = E.commitAction(one, { type: 'STRIKE', attacker: 'E', target: 'C' });
  eq(two.turn, 24);
  eq(two.status, 'DONE');
  eq(two.reason, 'CAP');
  deepEq(E.legalActions(two), []);
});

test('a side with no legal action at all ends the match as a stalemate', () => {
  const jammed = manualGame({
    tokens: { V: 0, I: 0 },
    units: [
      { id: 'A', owner: 'V', kind: 'CORE', cell: E.cellId(0, 0), alive: true, integrity: 2 },
      { id: 'E', owner: 'I', kind: 'CORE', cell: E.cellId(4, 4), alive: true, integrity: 2 },
    ],
  });
  deepEq(E.legalActions(jammed), [], 'nothing at all is playable');
  const settled = E.settleTermination(jammed);
  eq(settled.status, 'DONE');
  eq(settled.reason, 'STALEMATE');
});

test('checkAction dispatches on type and rejects nonsense', () => {
  const state = manualGame();
  deepEq(E.checkAction(state, { type: 'FOLD', axis: 'x', crease: 1, direction: 'low' }), { ok: true });
  eq(E.checkAction(state, { type: 'WAIT' }).reason, 'bad-action-type');
  eq(E.checkAction(state, null).reason, 'bad-action');
  eq(E.checkAction(state, { type: 'FOLD', axis: 'x', crease: 3, direction: 'low' }).reason, 'flap-outside-stationary-box');
});

test('legalActions puts folds before strikes, each in canonical order', () => {
  const contact = manualGame({
    units: manualGame().units.map((u) => (u.id === 'H' ? { ...u, cell: E.cellId(1, 2) } : u)),
  });
  const actions = E.legalActions(contact);
  const firstStrike = actions.findIndex((a) => a.type === 'STRIKE');
  ok(firstStrike > 0, 'strikes exist and follow the folds');
  ok(actions.slice(0, firstStrike).every((a) => a.type === 'FOLD'), 'folds come first');
  deepEq(actions[0], { type: 'FOLD', axis: 'x', crease: 1, direction: 'low' });
  deepEq(actions[actions.length - 1], { type: 'STRIKE', attacker: 'C', target: 'H' });
});

// ------------------------------------------------- slice 9: seeded legal setup
test('the PRNG is a pure deterministic integer generator', () => {
  const a = E.makePRNG(12345);
  const b = E.makePRNG(12345);
  const c = E.makePRNG(12346);
  const seqA = [];
  const seqB = [];
  const seqC = [];
  for (let i = 0; i < 8; i++) {
    seqA.push(a.nextU32());
    seqB.push(b.nextU32());
    seqC.push(c.nextU32());
  }
  deepEq(seqA, seqB, 'same seed gives the same stream');
  ok(!E.deepEqual(seqA, seqC), 'different seeds diverge');
  ok(seqA.every((n) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff), 'unsigned 32-bit integers only');
});

test('nextInt stays inside its bound for many draws', () => {
  const rng = E.makePRNG(7);
  for (let i = 0; i < 2000; i++) {
    const n = (i % 9) + 1;
    const v = rng.nextInt(n);
    ok(Number.isInteger(v) && v >= 0 && v < n, 'nextInt(' + n + ') returned ' + v);
    bump('prng_draws');
  }
  throws(() => rng.nextInt(0), 'a zero bound is meaningless');
});

test('createGame builds a complete, valid, deterministic starting position', () => {
  const g1 = E.createGame(2024, 'SOLO');
  const g2 = E.createGame(2024, 'SOLO');
  ok(E.deepEqual(g1, g2), 'same seed and mode gives a deep-equal game');
  eq(g1.version, E.VERSION);
  eq(g1.seed, 2024);
  eq(g1.mode, 'SOLO');
  eq(g1.turn, 0);
  eq(g1.status, 'ACTIVE');
  eq(g1.outcome, null);
  eq(g1.reason, null);
  deepEq(g1.tokens, { V: 3, I: 3 });
  deepEq(g1.history, []);
  eq(g1.units.length, 8);
  deepEq(g1.units.map((u) => u.id), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  ok(SIDES_OK(g1), 'one core at integrity 2 and three blades per side');
  eq(g1.toMove, g1.firstMover, 'the seeded first mover opens');
  ok(g1.firstMover === 'V' || g1.firstMover === 'I');
});

function SIDES_OK(state) {
  for (const side of ['V', 'I']) {
    const mine = state.units.filter((u) => u.owner === side);
    if (mine.length !== 4) return false;
    const cores = mine.filter((u) => u.kind === 'CORE');
    const blades = mine.filter((u) => u.kind === 'BLADE');
    if (cores.length !== 1 || blades.length !== 3) return false;
    if (cores[0].integrity !== 2 || !cores[0].alive) return false;
    if (!blades.every((b) => b.alive)) return false;
  }
  return true;
}

test('createGame rejects a bad seed or an unknown mode', () => {
  throws(() => E.createGame(1.5, 'SOLO'), 'non-integer seed');
  throws(() => E.createGame(-1, 'SOLO'), 'negative seed');
  throws(() => E.createGame('x', 'SOLO'), 'non-numeric seed');
  throws(() => E.createGame(1, 'ONLINE'), 'unknown mode');
});

test('validateSetup accepts seeded starts and names what is wrong otherwise', () => {
  deepEq(E.validateSetup(E.createGame(9, 'PASS')), { ok: true });
  const g = E.createGame(9, 'PASS');
  const stacked = { ...g, units: g.units.map((u) => (u.id === 'B' ? { ...u, cell: g.units[0].cell } : u)) };
  eq(E.validateSetup(stacked).reason, 'duplicate-placement');
  const wrongCount = { ...g, units: g.units.slice(0, 7) };
  eq(E.validateSetup(wrongCount).reason, 'wrong-unit-roster');
  const woundedCore = { ...g, units: g.units.map((u) => (u.id === 'A' ? { ...u, integrity: 1 } : u)) };
  eq(E.validateSetup(woundedCore).reason, 'wrong-unit-roster');
  const skewed = { ...g, units: g.units.map((u) => (u.id === 'F' ? { ...u, cell: E.cellId(2, 2) } : u)) };
  eq(E.validateSetup(skewed).reason, 'not-rotationally-symmetric');
});

test('validateSetup rejects a rotationally symmetric roster that still starts in contact', () => {
  // V blade on (4,3) sits directly under the indigo core mirrored onto (4,4)
  const vCells = [E.cellId(0, 0), E.cellId(1, 0), E.cellId(2, 0), E.cellId(4, 3)];
  const units = [];
  ['A', 'B', 'C', 'D'].forEach((id, i) => {
    units.push({ id, owner: 'V', kind: i === 0 ? 'CORE' : 'BLADE', cell: vCells[i], alive: true, integrity: i === 0 ? 2 : 0 });
  });
  ['E', 'F', 'G', 'H'].forEach((id, i) => {
    units.push({
      id,
      owner: 'I',
      kind: i === 0 ? 'CORE' : 'BLADE',
      cell: E.rotateCell(vCells[i]),
      alive: true,
      integrity: i === 0 ? 2 : 0,
    });
  });
  eq(new Set(units.map((u) => u.cell)).size, 8, 'placements are distinct');
  eq(E.validateSetup({ cells: E.initialTopology(), units }).reason, 'initial-contact');
});

test('validateSetup rejects a start with no opening fold', () => {
  let cells = E.initialTopology();
  for (const fold of [
    { axis: 'x', crease: 4, direction: 'high' },
    { axis: 'x', crease: 3, direction: 'high' },
    { axis: 'x', crease: 2, direction: 'high' },
    { axis: 'x', crease: 1, direction: 'high' },
    { axis: 'y', crease: 4, direction: 'high' },
    { axis: 'y', crease: 3, direction: 'high' },
    { axis: 'y', crease: 2, direction: 'high' },
    { axis: 'y', crease: 1, direction: 'high' },
  ]) cells = E.foldCells(cells, fold);
  deepEq(E.occupiedBounds(cells), { minX: 0, maxX: 0, minY: 0, maxY: 0 }, 'the whole sheet is one stack');
  eq(E.stackAt(cells, 0, 0).length, 25);
  deepEq(E.legalFolds(cells), []);
  const g = E.createGame(9, 'PASS');
  eq(E.validateSetup({ ...g, cells }).reason, 'no-opening-fold');
});

test('every seeded start over a wide sweep is legal, symmetric and strike-free', () => {
  for (let seed = 0; seed < 300; seed++) {
    const g = E.createGame(seed, 'SOLO');
    deepEq(E.validateSetup(g), { ok: true }, 'seed ' + seed + ' must validate');
    const cells = g.units.map((u) => u.cell);
    eq(new Set(cells).size, 8, 'seed ' + seed + ': eight distinct paper cells');
    deepEq(E.legalStrikes(g), [], 'seed ' + seed + ': no strike on turn one');
    deepEq(E.legalStrikes({ ...g, toMove: E.other(g.toMove) }), [], 'seed ' + seed + ': neither side can strike');
    const actions = E.legalActions(g);
    ok(actions.length > 0 && actions.every((a) => a.type === 'FOLD'), 'seed ' + seed + ': only folds open the game');
    eq(actions.length, 8, 'seed ' + seed + ': the flat sheet always offers eight folds');
    // 180-degree rotational symmetry between the two rosters
    for (const [vid, iid] of [['A', 'E'], ['B', 'F'], ['C', 'G'], ['D', 'H']]) {
      const v = E.paperOf(E.unitById(g, vid).cell);
      const i = E.paperOf(E.unitById(g, iid).cell);
      eq(i.px, 4 - v.px, 'seed ' + seed + ': ' + iid + ' mirrors ' + vid + ' in x');
      eq(i.py, 4 - v.py, 'seed ' + seed + ': ' + iid + ' mirrors ' + vid + ' in y');
    }
    bump('seeded_setups');
  }
});

test('vermilion always deploys in the near two rows and indigo in the far two', () => {
  for (let seed = 0; seed < 120; seed++) {
    const g = E.createGame(seed, 'PASS');
    for (const u of g.units) {
      const { py } = E.paperOf(u.cell);
      if (u.owner === 'V') ok(py <= 1, 'seed ' + seed + ': V stays in rows 0-1');
      else ok(py >= 3, 'seed ' + seed + ': I stays in rows 3-4');
      if (u.kind === 'CORE') ok(py === 0 || py === 4, 'seed ' + seed + ': cores start on the back row');
    }
  }
});

test('the seed also fixes the initiative used to break a capped tie', () => {
  const g = E.createGame(55, 'SOLO');
  eq(E.tiebreakSide(g), g.firstMover, 'the opener holds the tie-break initiative');
  const seen = new Set();
  for (let seed = 0; seed < 40; seed++) seen.add(E.createGame(seed, 'SOLO').firstMover);
  deepEq([...seen].sort(), ['I', 'V'], 'both sides get to open across seeds');
});

// ------------------------------------------- slice 10: victory and tiebreak
function scoredGame(overrides = {}) {
  return manualGame({ tokens: { V: 0, I: 0 }, turn: E.TURN_CAP, ...overrides });
}

function withUnits(state, patch) {
  return { ...state, units: state.units.map((u) => (patch[u.id] ? { ...u, ...patch[u.id] } : u)) };
}

test('topLiveOwner reports the owner of the highest live unit in a stack', () => {
  const cells = E.initialTopology().map((c) =>
    c.id === E.cellId(2, 4) ? { ...c, x: 2, y: 0, rank: 99 } : { ...c },
  );
  const state = manualGame({ cells });
  deepEq(E.stackAt(cells, 2, 0), [E.cellId(2, 0), E.cellId(2, 4)], 'indigo core lies on top of the vermilion core');
  eq(E.topLiveOwner(state, 2, 0), 'I');
  const dead = withUnits(state, { E: { alive: false, integrity: 0 } });
  eq(E.topLiveOwner(dead, 2, 0), 'V', 'a captured unit exposes the one underneath');
  eq(E.topLiveOwner(state, 4, 1), null, 'an empty stack is controlled by nobody');
});

test('exposedControl counts controlled top faces per side', () => {
  const state = manualGame();
  deepEq(E.exposedControl(state), { V: 4, I: 4 }, 'on the flat sheet every unit shows its own face');
  const dead = withUnits(state, { F: { alive: false }, G: { alive: false } });
  deepEq(E.exposedControl(dead), { V: 4, I: 2 });
});

test('capScore exposes the full comparison vector for both sides', () => {
  const state = withUnits(scoredGame(), { E: { integrity: 1 }, H: { alive: false } });
  deepEq(E.capScore(state), {
    V: { integrity: 2, blades: 3, exposed: 4 },
    I: { integrity: 1, blades: 2, exposed: 3 },
  });
});

test('a capped match is decided first on surviving core integrity', () => {
  const state = withUnits(scoredGame(), { A: { integrity: 1 } });
  eq(E.decideCap(state), 'I', 'the healthier core wins');
  eq(E.decideCap(withUnits(scoredGame(), { E: { integrity: 1 } })), 'V');
});

test('with equal cores a capped match is decided on surviving blades', () => {
  const state = withUnits(scoredGame(), { H: { alive: false } });
  eq(E.decideCap(state), 'V');
  eq(E.decideCap(withUnits(scoredGame(), { D: { alive: false } })), 'I');
});

test('with equal cores and blades a capped match is decided on exposed control', () => {
  // stack the indigo core on top of a vermilion cell: indigo gains a top face,
  // vermilion loses one, while rosters stay identical
  const cells = E.initialTopology().map((c) =>
    c.id === E.cellId(2, 4) ? { ...c, x: 2, y: 0, rank: 99 } : { ...c },
  );
  const state = scoredGame({ cells });
  deepEq(E.capScore(state).V, { integrity: 2, blades: 3, exposed: 3 });
  deepEq(E.capScore(state).I, { integrity: 2, blades: 3, exposed: 4 });
  eq(E.decideCap(state), 'I', 'more exposed control wins');
});

test('an exact tie goes to the seeded initiative, i.e. the side that opened', () => {
  const vFirst = scoredGame({ firstMover: 'V' });
  deepEq(E.capScore(vFirst).V, E.capScore(vFirst).I, 'the vectors really are equal');
  eq(E.decideCap(vFirst), 'V', 'the opener is compensated for having to move first');
  eq(E.decideCap(scoredGame({ firstMover: 'I' })), 'I');
});

test('a state with no initiative at all is a draw', () => {
  eq(E.decideCap(scoredGame({ firstMover: null })), 'D');
});

test('reaching the cap records the compared outcome, not a null', () => {
  const state = withUnits(
    manualGame({
      turn: 22,
      tokens: { V: 0, I: 0 },
      firstMover: 'V',
      units: manualGame().units.map((u) => (u.id === 'E' ? { ...u, cell: E.cellId(1, 2) } : u)),
    }),
    {},
  );
  const one = E.commitAction(state, { type: 'STRIKE', attacker: 'C', target: 'E' });
  const two = E.commitAction(one, { type: 'STRIKE', attacker: 'E', target: 'C' });
  eq(two.status, 'DONE');
  eq(two.reason, 'CAP');
  eq(two.outcome, 'V', 'vermilion holds a healthier core at the cap');
});

test('a stalemate is scored the same way as the cap', () => {
  const jammed = manualGame({
    tokens: { V: 0, I: 0 },
    units: [
      { id: 'A', owner: 'V', kind: 'CORE', cell: E.cellId(0, 0), alive: true, integrity: 2 },
      { id: 'E', owner: 'I', kind: 'CORE', cell: E.cellId(4, 4), alive: true, integrity: 1 },
    ],
  });
  const settled = E.settleTermination(jammed);
  eq(settled.reason, 'STALEMATE');
  eq(settled.outcome, 'V');
});

test('a captured core beats every comparison', () => {
  const crushed = withUnits(scoredGame({ turn: 5 }), { A: { alive: false, integrity: 0 } });
  const settled = E.settleTermination({ ...crushed, status: 'ACTIVE' });
  eq(settled.outcome, 'I');
  eq(settled.reason, 'CORE');
});

// ------------------------------- slice 11: deterministic bounded AI action
test('actionKey is a compact canonical key for every action', () => {
  eq(E.actionKey({ type: 'FOLD', axis: 'x', crease: 1, direction: 'low' }), 'Fx1l');
  eq(E.actionKey({ type: 'FOLD', axis: 'y', crease: 4, direction: 'high' }), 'Fy4h');
  eq(E.actionKey({ type: 'STRIKE', attacker: 'B', target: 'F' }), 'SBF');
  throws(() => E.actionKey({ type: 'WAIT' }), 'unknown action type has no key');
  const keys = E.legalActions(manualGame()).map(E.actionKey);
  eq(new Set(keys).size, keys.length, 'keys are unique within a legal action list');
});

test('the AI budget is a declared bounded constant', () => {
  ok(Number.isInteger(E.AI_ACTION_LIMIT) && E.AI_ACTION_LIMIT > 0 && E.AI_ACTION_LIMIT <= 128);
  ok(Number.isInteger(E.AI_REPLY_LIMIT) && E.AI_REPLY_LIMIT > 0 && E.AI_REPLY_LIMIT <= 128);
});

test('the AI takes an immediate core capture when one exists', () => {
  const state = manualGame({
    units: manualGame().units.map((u) => (u.id === 'E' ? { ...u, cell: E.cellId(1, 2), integrity: 1 } : u)),
  });
  deepEq(E.chooseAction(state), { type: 'STRIKE', attacker: 'C', target: 'E' });
  const explained = E.aiExplain(state);
  deepEq(explained.winning, ['SCE'], 'the winning action is identified as such');
  eq(explained.chosen, 'SCE');
});

test('the AI avoids handing the opponent an immediate core capture', () => {
  // vermilion core is on 1 integrity; folding rows 0-1 over drops it beside blade H
  const state = manualGame({
    units: manualGame().units.map((u) => {
      if (u.id === 'A') return { ...u, cell: E.cellId(0, 0), integrity: 1 };
      if (u.id === 'B') return { ...u, cell: E.cellId(2, 1) };
      if (u.id === 'H') return { ...u, cell: E.cellId(0, 2) };
      return u;
    }),
  });
  const suicide = { type: 'FOLD', axis: 'y', crease: 2, direction: 'low' };
  const after = E.commitAction(state, suicide);
  ok(E.legalStrikes(after).some((a) => a.target === 'A'), 'that fold really does expose the core');
  const explained = E.aiExplain(state);
  ok(explained.unsafe.includes(E.actionKey(suicide)), 'the AI marks the fold as unsafe');
  ok(!explained.unsafe.includes(explained.chosen), 'and does not choose an unsafe action');
  ok(!E.deepEqual(E.chooseAction(state), suicide));
});

test('the AI prefers capturing a blade over a neutral fold', () => {
  const state = manualGame({
    units: manualGame().units.map((u) => (u.id === 'H' ? { ...u, cell: E.cellId(1, 2) } : u)),
  });
  deepEq(E.chooseAction(state), { type: 'STRIKE', attacker: 'C', target: 'H' });
});

test('the AI is a pure function of the state', () => {
  for (let seed = 0; seed < 40; seed++) {
    const a = E.createGame(seed, 'SOLO');
    const b = E.createGame(seed, 'SOLO');
    const first = E.chooseAction(a);
    deepEq(E.chooseAction(a), first, 'repeated calls agree');
    deepEq(E.chooseAction(b), first, 'an identically rebuilt state agrees');
    deepEq(E.aiExplain(a).chosen, E.actionKey(first));
    bump('ai_determinism_checks');
  }
});

test('the AI never proposes an illegal action, over many seeds and turns', () => {
  for (let seed = 0; seed < 60; seed++) {
    let state = E.createGame(seed, 'SOLO');
    while (state.status === 'ACTIVE') {
      const action = E.chooseAction(state);
      deepEq(E.checkAction(state, action), { ok: true }, 'seed ' + seed + ' turn ' + state.turn);
      state = E.commitAction(state, action);
      bump('ai_actions_checked');
    }
    ok(state.turn <= E.TURN_CAP, 'seed ' + seed + ' respects the cap');
  }
});

test('the AI refuses to move in a finished match', () => {
  const done = manualGame({ status: 'DONE', outcome: 'V', reason: 'CORE' });
  throws(() => E.chooseAction(done));
});

test('aiExplain reports a bounded, honest account of what was considered', () => {
  const state = E.createGame(3, 'SOLO');
  const explained = E.aiExplain(state);
  eq(explained.considered, E.legalActions(state).length);
  ok(explained.considered <= E.AI_ACTION_LIMIT, 'never more than the declared budget');
  eq(explained.scores.length, explained.considered);
  ok(explained.scores.every((s) => typeof s.key === 'string' && Number.isInteger(s.score)), 'integer scores only');
  ok(explained.scores.some((s) => s.key === explained.chosen));
  eq(explained.depth, 2, 'one own action plus one opponent reply');
});

// -------------------------------------------------- slice 12: replay equality
function selfPlay(seed, mode = 'SOLO') {
  let state = E.createGame(seed, mode);
  while (state.status === 'ACTIVE') state = E.commitAction(state, E.chooseAction(state));
  return state;
}

test('decodeAction is the exact inverse of actionKey', () => {
  const samples = [
    { type: 'FOLD', axis: 'x', crease: 1, direction: 'low' },
    { type: 'FOLD', axis: 'x', crease: 4, direction: 'high' },
    { type: 'FOLD', axis: 'y', crease: 2, direction: 'low' },
    { type: 'STRIKE', attacker: 'A', target: 'H' },
    { type: 'STRIKE', attacker: 'G', target: 'D' },
  ];
  for (const action of samples) {
    deepEq(E.decodeAction(E.actionKey(action)), action, 'round trip ' + E.actionKey(action));
    bump('action_codec_checks');
  }
});

test('decodeAction rejects malformed keys', () => {
  for (const bad of ['', 'F', 'Fx1', 'Fx1z', 'Fz1l', 'Fx-1l', 'SBB', 'SB', 'SBZ', 'SZB', 'Xx1l', 'fx1l', 'Fx1L', 'Fx1lx']) {
    throws(() => E.decodeAction(bad), 'must reject ' + JSON.stringify(bad));
    bump('action_codec_rejections');
  }
});

test('decodeActionList splits a concatenated canonical log', () => {
  deepEq(E.decodeActionList('Fx1lSBF'), [
    { type: 'FOLD', axis: 'x', crease: 1, direction: 'low' },
    { type: 'STRIKE', attacker: 'B', target: 'F' },
  ]);
  deepEq(E.decodeActionList(''), []);
  throws(() => E.decodeActionList('Fx1lS'), 'truncated strike');
  throws(() => E.decodeActionList('Fx1lSBFq'), 'trailing garbage');
  throws(() => E.decodeActionList('Zx1l'), 'unknown action prefix');
});

test('actionLog is the canonical committed action list', () => {
  const state = selfPlay(11);
  const log = E.actionLog(state);
  eq(log.length, state.turn, 'one key per committed action');
  eq(E.encodeActionList(E.decodeActionList(log.join(''))).length, log.join('').length, 'the log is canonical');
  deepEq(log, state.history.map((h) => E.actionKey(h.type === 'FOLD' ? { ...h } : { ...h })));
});

test('the same seed and action log replay to a deep-equal state', () => {
  for (let seed = 0; seed < 40; seed++) {
    const played = selfPlay(seed, 'SOLO');
    const replayed = E.replay(seed, 'SOLO', E.actionLog(played).join(''));
    ok(E.deepEqual(replayed, played), 'seed ' + seed + ' replays exactly');
    bump('replays');
  }
});

test('replay also reproduces pass-and-play logs', () => {
  const played = selfPlay(7, 'PASS');
  ok(E.deepEqual(E.replay(7, 'PASS', E.actionLog(played).join('')), played));
});

test('replay refuses a log that contains an impossible action', () => {
  const played = selfPlay(2);
  const log = E.actionLog(played);
  throws(() => E.replay(2, 'SOLO', 'SAE' + log.join('')), 'a strike with no contact cannot open');
  throws(() => E.replay(2, 'SOLO', log.join('') + 'Fx1l'), 'no action after the match ends');
  throws(() => E.replay(2, 'SOLO', 'Fx9l'), 'a crease outside the sheet');
});

test('replay is deterministic and independent of the AI', () => {
  const played = selfPlay(5);
  const log = E.actionLog(played).join('');
  ok(E.deepEqual(E.replay(5, 'SOLO', log), E.replay(5, 'SOLO', log)), 'repeatable');
  ok(!E.deepEqual(E.replay(5, 'SOLO', log), E.createGame(5, 'SOLO')), 'and it really applies the log');
});

// ------------------------- slice 13: share string validation and corruption
test('serializeMatch emits a compact validated result string', () => {
  const played = selfPlay(21, 'SOLO');
  const text = E.serializeMatch(played);
  const parts = text.split('-');
  eq(parts.length, 6, 'version, seed, mode, actions, outcome, checksum');
  eq(parts[0], 'OW1');
  eq(parts[1], (21).toString(36));
  eq(parts[2], 'S');
  eq(parts[3], E.actionLog(played).join(''));
  eq(parts[4], played.outcome);
  ok(/^[0-9a-z]+$/.test(parts[5]), 'checksum is lowercase base36');
  ok(/^[0-9A-Za-z-]+$/.test(text) && !/\s/.test(text), 'no whitespace, no exotic characters');
});

test('serializeMatch refuses an unfinished match', () => {
  throws(() => E.serializeMatch(E.createGame(1, 'SOLO')));
});

test('parseMatch accepts its own output and rebuilds the exact match', () => {
  for (let seed = 0; seed < 40; seed++) {
    const mode = seed % 2 === 0 ? 'SOLO' : 'PASS';
    const played = selfPlay(seed, mode);
    const text = E.serializeMatch(played);
    const parsed = E.parseMatch(text);
    eq(parsed.ok, true, 'seed ' + seed + ': ' + (parsed.reason || ''));
    eq(parsed.seed, seed);
    eq(parsed.mode, mode);
    eq(parsed.outcome, played.outcome);
    ok(E.deepEqual(parsed.state, played), 'seed ' + seed + ' rebuilds deep-equal');
    bump('share_round_trips');
  }
});

test('parseMatch rejects malformed payloads', () => {
  const good = E.serializeMatch(selfPlay(21, 'SOLO'));
  const cases = [
    [null, 'not-a-string'],
    [42, 'not-a-string'],
    ['', 'bad-field-count'],
    ['OW1-l-S-Fx1l', 'bad-field-count'],
    ['OW1-l-S-Fx1l-V-abc-extra', 'bad-field-count'],
    ['OW0' + good.slice(3), 'bad-version'],
    [good + ' ', 'contains-whitespace'],
    [' ' + good, 'contains-whitespace'],
  ];
  for (const [input, reason] of cases) {
    eq(E.parseMatch(input).reason, reason, 'input ' + JSON.stringify(input));
    bump('share_rejections');
  }
});

test('parseMatch rejects bad fields', () => {
  const played = selfPlay(21, 'SOLO');
  const [v, seed, mode, log, outcome] = E.serializeMatch(played).split('-');
  const rebuild = (parts) => parts.join('-');
  const sign = (parts) => rebuild([...parts, E.checksum(rebuild(parts))]);
  eq(E.parseMatch(sign([v, 'ZZ', mode, log, outcome])).reason, 'bad-seed');
  eq(E.parseMatch(sign([v, '', mode, log, outcome])).reason, 'bad-seed');
  eq(E.parseMatch(sign([v, seed, 'X', log, outcome])).reason, 'bad-mode');
  eq(E.parseMatch(sign([v, seed, mode, log, 'Q'])).reason, 'bad-outcome');
  eq(E.parseMatch(rebuild([v, seed, mode, log, outcome, 'NOT!'])).reason, 'bad-checksum-format');
});

test('parseMatch rejects a corrupted payload through the checksum', () => {
  const good = E.serializeMatch(selfPlay(21, 'SOLO'));
  const flip = good.slice(0, -1) + (good.slice(-1) === 'a' ? 'b' : 'a');
  eq(E.parseMatch(flip).reason, 'checksum-mismatch');
  const parts = good.split('-');
  const tamperedLog = [parts[0], parts[1], parts[2], 'Fx1l' + parts[3], parts[4], parts[5]].join('-');
  eq(E.parseMatch(tamperedLog).reason, 'checksum-mismatch', 'editing the log invalidates the checksum');
});

test('parseMatch rejects a noncanonical but correctly checksummed payload', () => {
  const played = selfPlay(21, 'SOLO');
  const [v, seed, mode, log, outcome] = E.serializeMatch(played).split('-');
  const sign = (parts) => [...parts, E.checksum(parts.join('-'))].join('-');
  eq(E.parseMatch(sign([v, '0' + seed, mode, log, outcome])).reason, 'noncanonical', 'padded seed');
  eq(E.parseMatch(sign([v, seed.toUpperCase() === seed ? seed : seed.toUpperCase(), mode, log, outcome])).ok, false);
});

test('parseMatch rejects impossible and unfinished logs', () => {
  const played = selfPlay(21, 'SOLO');
  const [v, seed, mode, log, outcome] = E.serializeMatch(played).split('-');
  const sign = (parts) => [...parts, E.checksum(parts.join('-'))].join('-');
  eq(E.parseMatch(sign([v, seed, mode, 'SAE' + log, outcome])).reason, 'illegal-log');
  eq(E.parseMatch(sign([v, seed, mode, log + 'Fx1l', outcome])).reason, 'illegal-log');
  eq(E.parseMatch(sign([v, seed, mode, '', outcome])).reason, 'unfinished');
  const flippedOutcome = outcome === 'V' ? 'I' : 'V';
  eq(E.parseMatch(sign([v, seed, mode, log, flippedOutcome])).reason, 'outcome-mismatch');
});

test('checksum is a stable pure function', () => {
  eq(E.checksum('OW1-l-S'), E.checksum('OW1-l-S'));
  ok(E.checksum('a') !== E.checksum('b'));
  ok(/^[0-9a-z]+$/.test(E.checksum('anything at all')));
});

test('local match history is bounded and carries no personal data', () => {
  eq(E.HISTORY_LIMIT, 20);
  const played = selfPlay(21, 'SOLO');
  const record = E.matchRecord(played);
  deepEq(Object.keys(record).sort(), ['actions', 'mode', 'outcome', 'reason', 'seed', 'share'].sort());
  eq(record.seed, 21);
  eq(record.mode, 'SOLO');
  eq(record.outcome, played.outcome);
  eq(record.actions, played.turn);
  eq(record.share, E.serializeMatch(played));
  let list = [];
  for (let i = 0; i < 25; i++) list = E.pushMatchRecord(list, { ...record, seed: i });
  eq(list.length, 20, 'history never grows past the limit');
  eq(list[0].seed, 24, 'newest first');
  eq(list[19].seed, 5, 'oldest entries are dropped');
});

// ------------------- slice 14: property sweeps over seeds and fold sequences
function assertTopologyInvariant(state, where) {
  const cells = state.cells;
  if (cells.length !== 25) fail(where + ': expected 25 cells, got ' + cells.length);
  const ids = cells.map((c) => c.id).sort((a, b) => a - b);
  for (let i = 0; i < 25; i++) if (ids[i] !== i) fail(where + ': cell id ' + i + ' is lost or duplicated');
  const ranks = cells.map((c) => c.rank).sort((a, b) => a - b);
  for (let i = 0; i < 25; i++) if (ranks[i] !== i) fail(where + ': ranks are not a dense total order');
  let counted = 0;
  const seen = new Set();
  for (const stack of E.stacksOf(cells)) {
    counted += stack.ids.length;
    for (const id of stack.ids) {
      if (seen.has(id)) fail(where + ': cell ' + id + ' appears in two stacks');
      seen.add(id);
    }
    const stackRanks = stack.ids.map((id) => cells.find((c) => c.id === id).rank);
    for (let i = 1; i < stackRanks.length; i++) {
      if (stackRanks[i] <= stackRanks[i - 1]) fail(where + ': stack order is ambiguous');
    }
  }
  if (counted !== 25) fail(where + ': stacks hold ' + counted + ' cells, not 25');
  for (const cell of cells) {
    if (cell.x < 0 || cell.x > 4 || cell.y < 0 || cell.y > 4) fail(where + ': cell left the sheet');
    if (cell.face !== 0 && cell.face !== 1) fail(where + ': cell has no valid face');
  }
  for (const unit of state.units) {
    if (!cells.some((c) => c.id === unit.cell)) fail(where + ': unit sits on no paper cell');
  }
}

test('sweep: complete self-play always terminates inside the cap with every invariant held', () => {
  const outcomes = { V: 0, I: 0, D: 0 };
  const reasons = { CORE: 0, CAP: 0, STALEMATE: 0 };
  let longest = 0;
  let totalActions = 0;
  for (let seed = 0; seed < 200; seed++) {
    for (const mode of ['SOLO', 'PASS']) {
      let state = E.createGame(seed, mode);
      assertTopologyInvariant(state, 'seed ' + seed + ' start');
      let guard = 0;
      while (state.status === 'ACTIVE') {
        if (++guard > E.TURN_CAP + 1) fail('seed ' + seed + ': self-play did not terminate');
        const action = E.chooseAction(state);
        const verdict = E.checkAction(state, action);
        if (!verdict.ok) fail('seed ' + seed + ': AI proposed an illegal action (' + verdict.reason + ')');
        const before = state.turn;
        state = E.commitAction(state, action);
        if (state.turn !== before + 1) fail('seed ' + seed + ': turn counter did not advance by one');
        assertTopologyInvariant(state, 'seed ' + seed + ' turn ' + state.turn);
        bump('sweep_actions');
      }
      if (state.turn > E.TURN_CAP) fail('seed ' + seed + ': exceeded the action cap');
      if (!['V', 'I', 'D'].includes(state.outcome)) fail('seed ' + seed + ': terminal state has no outcome');
      outcomes[state.outcome] += 1;
      reasons[state.reason] += 1;
      longest = Math.max(longest, state.turn);
      totalActions += state.turn;

      const log = E.actionLog(state).join('');
      if (!E.deepEqual(E.replay(seed, mode, log), state)) fail('seed ' + seed + ': replay diverged');
      if (!E.deepEqual(E.replay(seed, mode, log), E.replay(seed, mode, log))) fail('replay is not stable');
      const parsed = E.parseMatch(E.serializeMatch(state));
      if (!parsed.ok) fail('seed ' + seed + ': own share string rejected (' + parsed.reason + ')');
      if (!E.deepEqual(parsed.state, state)) fail('seed ' + seed + ': share string rebuilt a different match');
      bump('sweep_matches');
    }
  }
  bump('sweep_wins_V', outcomes.V);
  bump('sweep_wins_I', outcomes.I);
  bump('sweep_draws', outcomes.D);
  bump('sweep_end_core', reasons.CORE);
  bump('sweep_end_cap', reasons.CAP);
  bump('sweep_end_stalemate', reasons.STALEMATE);
  bump('sweep_longest_match', longest);
  ok(outcomes.V > 0 && outcomes.I > 0, 'both sides win some matches');
  ok(totalActions > 0);
});

test('sweep: long legal fold sequences never lose paper and always unfold back', () => {
  for (let seed = 0; seed < 150; seed++) {
    const rng = E.makePRNG(seed + 90001);
    let state = { cells: E.initialTopology(), units: [], history: [] };
    const trail = [state];
    let depth = 0;
    while (depth < 8) {
      const folds = E.legalFolds(state.cells);
      if (folds.length === 0) break;
      const fold = folds[rng.nextInt(folds.length)];
      const next = E.foldState(state, fold);
      assertTopologyInvariant({ ...next, units: [] }, 'fold sweep seed ' + seed + ' depth ' + depth);
      if (!E.deepEqual(E.unfold(next), state)) fail('fold sweep seed ' + seed + ': unfold did not restore');
      state = next;
      trail.push(state);
      depth += 1;
      bump('sweep_folds');
    }
    ok(depth >= 1, 'seed ' + seed + ' folded at least once');
    // unwind the whole stack of folds and land back on the flat sheet
    let unwound = state;
    for (let i = trail.length - 2; i >= 0; i--) {
      unwound = E.unfold(unwound);
      if (!E.deepEqual(unwound, trail[i])) fail('fold sweep seed ' + seed + ': LIFO unwind diverged at ' + i);
    }
    if (!E.deepEqual(unwound.cells, E.initialTopology())) fail('fold sweep seed ' + seed + ': sheet not flat again');
    bump('sweep_fold_sequences');
  }
});

test('sweep: every legal fold from many reachable topologies is reversible and lossless', () => {
  const rng = E.makePRNG(4242);
  for (let trial = 0; trial < 120; trial++) {
    let state = { cells: E.initialTopology(), units: [], history: [] };
    const steps = rng.nextInt(4);
    for (let i = 0; i < steps; i++) {
      const folds = E.legalFolds(state.cells);
      if (folds.length === 0) break;
      state = E.foldState(state, folds[rng.nextInt(folds.length)]);
    }
    for (const fold of E.legalFolds(state.cells)) {
      const next = E.foldState(state, fold);
      assertTopologyInvariant({ ...next, units: [] }, 'trial ' + trial);
      if (!E.deepEqual(E.unfold(next), state)) fail('trial ' + trial + ': unfold mismatch');
      // faces of every moved cell must have flipped exactly once
      const movedIds = new Set(E.flapCellIds(state.cells, fold.axis, fold.crease, fold.direction));
      for (const id of movedIds) {
        const was = state.cells.find((c) => c.id === id).face;
        const now = next.cells.find((c) => c.id === id).face;
        if (was === now) fail('trial ' + trial + ': moved cell ' + id + ' did not flip');
      }
      for (const cell of state.cells) {
        if (movedIds.has(cell.id)) continue;
        if (next.cells.find((c) => c.id === cell.id).face !== cell.face) {
          fail('trial ' + trial + ': stationary cell ' + cell.id + ' flipped');
        }
      }
      bump('sweep_fold_probes');
    }
  }
});

test('sweep: identical seed and log always produce deep-equal states across modes', () => {
  for (let seed = 500; seed < 560; seed++) {
    for (const mode of ['SOLO', 'PASS']) {
      const a = E.createGame(seed, mode);
      const b = E.createGame(seed, mode);
      if (!E.deepEqual(a, b)) fail('seed ' + seed + ': setup diverged');
      let s1 = a;
      let s2 = b;
      const log = [];
      while (s1.status === 'ACTIVE') {
        const action = E.chooseAction(s1);
        log.push(E.actionKey(action));
        s1 = E.commitAction(s1, action);
        s2 = E.commitAction(s2, E.decodeAction(log[log.length - 1]));
        if (!E.deepEqual(s1, s2)) fail('seed ' + seed + ': parallel play diverged');
      }
      if (!E.deepEqual(E.replay(seed, mode, log.join('')), s1)) fail('seed ' + seed + ': log replay diverged');
      bump('sweep_determinism_matches');
    }
  }
});

// -------------------- slice 15: pure view-model helpers the interface needs
test('sideName and unitLabel describe units without relying on colour alone', () => {
  eq(E.sideName('V'), 'Vermilion');
  eq(E.sideName('I'), 'Indigo');
  const state = manualGame();
  eq(E.unitLabel(state, 'A'), 'Vermilion core A (integrity 2)');
  eq(E.unitLabel(state, 'C'), 'Vermilion blade C');
  eq(E.unitLabel(state, 'F'), 'Indigo blade F');
});

test('moveOverDirection names where the flap travels', () => {
  eq(E.moveOverDirection('x', 'low'), 'right');
  eq(E.moveOverDirection('x', 'high'), 'left');
  eq(E.moveOverDirection('y', 'low'), 'down');
  eq(E.moveOverDirection('y', 'high'), 'up');
  throws(() => E.moveOverDirection('z', 'low'));
});

test('describeAction produces a plain-language label for every legal action', () => {
  const state = manualGame({
    units: manualGame().units.map((u) => (u.id === 'H' ? { ...u, cell: E.cellId(1, 2) } : u)),
  });
  eq(
    E.describeAction(state, { type: 'FOLD', axis: 'x', crease: 1, direction: 'low' }),
    'Fold column 0 right over crease x1',
  );
  eq(
    E.describeAction(state, { type: 'FOLD', axis: 'y', crease: 3, direction: 'high' }),
    'Fold rows 3-4 up over crease y3',
  );
  eq(
    E.describeAction(state, { type: 'STRIKE', attacker: 'C', target: 'H' }),
    'Strike: Vermilion blade C hits Indigo blade H',
  );
  for (const action of E.legalActions(state)) {
    const label = E.describeAction(state, action);
    ok(typeof label === 'string' && label.length > 8, 'every action gets a real label');
    bump('action_labels');
  }
});

test('previewFold reports the flap, its destination, its travel and its layering', () => {
  const state = manualGame();
  const preview = E.previewFold(state, { axis: 'x', crease: 4, direction: 'high' });
  eq(preview.ok, true);
  eq(preview.movesOver, 'left');
  eq(preview.flap.length, 5, 'column 4 is the flap');
  deepEq(preview.flap.map((f) => f.id).sort((a, b) => a - b), [4, 9, 14, 19, 24]);
  deepEq(preview.flap[0].from, { x: 4, y: 0 });
  deepEq(preview.flap[0].to, { x: 3, y: 0 });
  eq(preview.flap[0].face, 0);
  eq(preview.flap[0].newFace, 1, 'the flap shows its other face after the fold');
  eq(preview.stationaryIds.length, 20);
  deepEq(preview.destinations, [
    { x: 3, y: 0 },
    { x: 3, y: 1 },
    { x: 3, y: 2 },
    { x: 3, y: 3 },
    { x: 3, y: 4 },
  ]);
  deepEq(preview.overlaps, preview.destinations, 'each destination covers a stationary stack');
  const top = preview.stacksAfter.find((s) => s.x === 3 && s.y === 0);
  deepEq(top.ids, [3, 4], 'the flap cell ends up above the stationary cell');
  deepEq(top.movingIds, [4]);
});

test('previewFold predicts exactly the new strike contacts a fold would create', () => {
  const state = manualGame();
  deepEq(E.legalStrikes(state), [], 'nothing is in contact yet');
  const preview = E.previewFold(state, { axis: 'y', crease: 2, direction: 'low' });
  eq(preview.ok, true);
  ok(preview.newContacts.length > 0, 'this fold definitely creates contact');
  const committed = E.commitAction(state, { type: 'FOLD', axis: 'y', crease: 2, direction: 'low' });
  const actual = [];
  for (const a of committed.units) {
    for (const b of committed.units) {
      if (a.id >= b.id || a.owner === b.owner) continue;
      if (!a.alive || !b.alive) continue;
      if (E.inContact(committed.cells, a.cell, b.cell)) actual.push({ a: a.id, b: b.id });
    }
  }
  deepEq(preview.newContacts, actual, 'the preview matches the committed reality exactly');
  deepEq(
    preview.newStrikes.map((s) => s.attacker + '>' + s.target).sort(),
    E.legalStrikes({ ...committed, toMove: 'V' })
      .concat(E.legalStrikes({ ...committed, toMove: 'I' }))
      .map((s) => s.attacker + '>' + s.target)
      .sort(),
    'and it lists the strikes both sides would gain',
  );
});

test('previewFold reports why an illegal fold cannot be previewed', () => {
  const state = manualGame();
  const preview = E.previewFold(state, { axis: 'x', crease: 3, direction: 'low' });
  eq(preview.ok, false);
  eq(preview.reason, 'flap-outside-stationary-box');
  eq(E.previewFold(state, { axis: 'q', crease: 3, direction: 'low' }).reason, 'bad-axis');
  eq(E.previewFold({ ...state, tokens: { V: 0, I: 3 } }, { axis: 'x', crease: 1, direction: 'low' }).reason, 'no-fold-tokens');
});

test('previewFold never mutates the state it previews', () => {
  const state = manualGame();
  const snapshot = JSON.stringify(state);
  for (const fold of E.legalFolds(state.cells)) E.previewFold(state, fold);
  eq(JSON.stringify(state), snapshot);
});

test('boardMirror is a complete actionable textual mirror of the board', () => {
  const state = manualGame();
  const mirror = E.boardMirror(state);
  deepEq(mirror.bounds, { minX: 0, maxX: 4, minY: 0, maxY: 4 });
  eq(mirror.stacks.length, 25, 'the flat sheet shows 25 single-cell stacks');
  eq(mirror.stacks.reduce((n, s) => n + s.layers.length, 0), 25, 'every paper cell is mirrored exactly once');
  const home = mirror.stacks.find((s) => s.x === 2 && s.y === 0);
  eq(home.layers.length, 1);
  deepEq(home.layers[0], {
    id: E.cellId(2, 0),
    px: 2,
    py: 0,
    face: 0,
    rank: E.cellId(2, 0),
    unit: { id: 'A', owner: 'V', kind: 'CORE', integrity: 2, alive: true },
  });
  eq(home.topOwner, 'V');
  eq(home.text.includes('Vermilion core A'), true, 'each stack reads out its contents');
  eq(mirror.toMove, 'V');
  eq(mirror.turn, 0);
  eq(mirror.cap, E.TURN_CAP);
  deepEq(mirror.tokens, { V: 3, I: 3 });
  deepEq(mirror.score, E.capScore(state));
  eq(mirror.actions.length, E.legalActions(state).length);
  ok(mirror.actions.every((a) => typeof a.key === 'string' && typeof a.label === 'string'), 'actions are selectable');
});

test('boardMirror follows the paper as it folds', () => {
  const state = E.commitAction(manualGame(), { type: 'FOLD', axis: 'x', crease: 4, direction: 'high' });
  const mirror = E.boardMirror(state);
  eq(mirror.stacks.length, 20);
  eq(mirror.stacks.reduce((n, s) => n + s.layers.length, 0), 25, 'no paper is lost in the mirror');
  const doubled = mirror.stacks.find((s) => s.x === 3 && s.y === 0);
  eq(doubled.layers.length, 2);
  eq(doubled.layers[1].face, 1, 'the top layer is the flipped flap');
  eq(doubled.text.includes('2 layers'), true);
});

test('fairUndo reverts exactly one unresponded action and refuses when not armed', () => {
  const state = manualGame();
  const after = E.commitAction(state, { type: 'FOLD', axis: 'x', crease: 1, direction: 'low' });
  ok(E.deepEqual(E.fairUndo(after, true), state), 'an armed undo restores the whole action');
  throws(() => E.fairUndo(after, false), 'an unarmed undo is refused');
  throws(() => E.fairUndo(state, true), 'there is nothing to undo at the start');
  eq(E.undoAvailable(after, true), true);
  eq(E.undoAvailable(after, false), false);
  eq(E.undoAvailable(state, true), false);
});

// ------------------- slice 16: static scans of the shipped, dependency-free files
const ROOT = new URL('./', import.meta.url);

function readShipped(name) {
  return readFileSync(new URL(name, ROOT), 'utf8');
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1 ');
}

function countMatches(source, pattern) {
  const found = source.match(pattern);
  return found ? found.length : 0;
}

test('the repository ships only the allowed dependency-free files', () => {
  const allowed = new Set(['.git', 'index.html', 'engine.mjs', 'verify.mjs', 'README.md', 'TDD-EVIDENCE.md']);
  const present = readdirSync(new URL('.', ROOT));
  for (const entry of present) ok(allowed.has(entry), 'unexpected file in the repository: ' + entry);
  for (const required of ['index.html', 'engine.mjs', 'verify.mjs', 'README.md', 'TDD-EVIDENCE.md']) {
    ok(present.includes(required), 'missing required file: ' + required);
  }
  ok(!present.includes('package.json') && !present.includes('node_modules'), 'no dependency tooling');
});

test('engine.mjs is a self-contained pure module', () => {
  const raw = readShipped('engine.mjs');
  const code = stripComments(raw);
  eq(countMatches(code, /^\s*import[\s{]/gm), 0, 'the engine imports nothing at all');
  for (const [name, pattern] of [
    ['Math.random', /Math\s*\.\s*random/g],
    ['Date', /\bDate\b/g],
    ['performance', /\bperformance\s*\./g],
    ['document', /\bdocument\b/g],
    ['window', /\bwindow\b/g],
    ['globalThis', /\bglobalThis\b/g],
    ['localStorage', /\blocalStorage\b/g],
    ['sessionStorage', /\bsessionStorage\b/g],
    ['fetch', /\bfetch\s*\(/g],
    ['XMLHttpRequest', /XMLHttpRequest/g],
    ['WebSocket', /WebSocket/g],
    ['process', /\bprocess\s*\./g],
    ['require', /\brequire\s*\(/g],
    ['eval', /\beval\s*\(/g],
    ['new Function', /new\s+Function/g],
  ]) {
    eq(countMatches(code, pattern), 0, 'engine.mjs must not reference ' + name);
    bump('engine_purity_scans');
  }
});

test('verify.mjs depends only on node builtins', () => {
  const code = stripComments(readShipped('verify.mjs'));
  const imports = code.match(/^\s*import[^\n]*from\s*['"]([^'"]+)['"]/gm) || [];
  ok(imports.length > 0, 'there are imports to check');
  for (const line of imports) {
    const source = line.match(/['"]([^'"]+)['"]/)[1];
    ok(source.startsWith('node:') || source.startsWith('./'), 'unexpected dependency: ' + source);
  }
});

test('index.html is a single offline page that imports the engine', () => {
  const html = readShipped('index.html');
  ok(html.length > 4000, 'the page is a real interface, not a stub');
  ok(/^<!doctype html>/i.test(html.trim()), 'has a doctype');
  ok(/<html lang="[a-z-]+"/i.test(html), 'declares a language');
  ok(/<meta\s+name="viewport"\s+content="[^"]*width=device-width/i.test(html), 'mobile-first viewport');
  ok(/<title>[^<]+<\/title>/i.test(html), 'has a title');
  ok(/<script type="module">/.test(html), 'uses a module script');
  ok(/from\s+'\.\/engine\.mjs'/.test(html) || /from\s+"\.\/engine\.mjs"/.test(html), 'imports ./engine.mjs');
});

test('index.html makes no network calls and loads no external assets', () => {
  const html = readShipped('index.html');
  for (const [name, pattern] of [
    ['absolute URL', /https?:\/\//g],
    ['protocol-relative URL', /["'(]\/\//g],
    ['@import', /@import/g],
    ['fetch', /\bfetch\s*\(/g],
    ['XMLHttpRequest', /XMLHttpRequest/g],
    ['WebSocket', /WebSocket/g],
    ['EventSource', /EventSource/g],
    ['sendBeacon', /sendBeacon/g],
    ['analytics or telemetry', /analytics|telemetry|gtag|mixpanel|sentry|hotjar/gi],
    ['a remote font', /@font-face/g],
    ['an external link tag', /<link[^>]+href=["'](?!#)[^"']*\/\//gi],
  ]) {
    eq(countMatches(html, pattern), 0, 'index.html must not contain ' + name);
    bump('ui_offline_scans');
  }
});

test('index.html avoids inline handlers, eval and innerHTML', () => {
  const html = readShipped('index.html');
  for (const [name, pattern] of [
    ['inline event handler attributes', /\son[a-z]+\s*=\s*["']/gi],
    ['eval', /\beval\s*\(/g],
    ['new Function', /new\s+Function/g],
    ['document.write', /document\s*\.\s*write/g],
    ['innerHTML', /innerHTML/g],
    ['outerHTML', /outerHTML/g],
    ['insertAdjacentHTML', /insertAdjacentHTML/g],
    ['a string timer', /setTimeout\s*\(\s*['"]/g],
    ['javascript: urls', /javascript:/gi],
  ]) {
    eq(countMatches(html, pattern), 0, 'index.html must not contain ' + name);
    bump('ui_safety_scans');
  }
  ok(/addEventListener\(/.test(html), 'events are bound in script');
});

test('index.html uses semantic accessible controls with real ids', () => {
  const html = readShipped('index.html');
  for (const id of [
    'new-game',
    'replay-seed',
    'seed',
    'undo',
    'pause',
    'help',
    'export-png',
    'copy-share',
    'share-text',
    'board',
    'actions',
    'preview',
    'mirror',
    'history',
    'status',
    'outcome-dialog',
    'export-canvas',
  ]) {
    ok(new RegExp('id="' + id + '"').test(html), 'missing element id="' + id + '"');
    bump('ui_control_scans');
  }
  ok(countMatches(html, /<button/g) >= 8, 'plenty of real buttons');
  ok(/<fieldset/.test(html) && /<legend/.test(html), 'the mode choice is a labelled group');
  ok(/<dialog/.test(html), 'modals are real dialogs');
  ok(/aria-live="polite"/.test(html), 'there is a polite live region');
  ok(/role="status"/.test(html), 'status is announced');
  ok(countMatches(html, /<label/g) >= 3, 'inputs are labelled');
  ok(/<main/.test(html) && /<header/.test(html) && /<h1/.test(html), 'semantic landmarks');
  ok(/lang="en"/.test(html));
});

test('index.html carries the accessibility and motion guarantees in its own CSS', () => {
  const html = readShipped('index.html');
  ok(/prefers-reduced-motion/.test(html), 'reduced motion is honoured');
  ok(/:focus-visible/.test(html), 'focus is visible');
  ok(/min-height:\s*44px|min-block-size:\s*44px/.test(html), '44px minimum target height');
  ok(/min-width:\s*44px|min-inline-size:\s*44px/.test(html), '44px minimum target width');
  ok(/repeating-linear-gradient/.test(html), 'paper fibres are procedural CSS');
  ok(/transform-style:\s*preserve-3d|perspective/.test(html), 'the fold hinge is CSS 3D');
  ok(/@media\s*\(max-width:\s*3[0-9][0-9]px\)|clamp\(/.test(html), 'the layout is fluid down to 320px');
  ok(/prefers-contrast|forced-colors/.test(html), 'high contrast is considered');
});

test('index.html drives the real engine rules, not a decorative mock', () => {
  const html = readShipped('index.html');
  for (const symbol of [
    'createGame',
    'commitAction',
    'chooseAction',
    'legalActions',
    'checkAction',
    'previewFold',
    'boardMirror',
    'describeAction',
    'actionKey',
    'serializeMatch',
    'parseMatch',
    'fairUndo',
    'undoAvailable',
    'matchRecord',
    'pushMatchRecord',
    'aiExplain',
    'TURN_CAP',
    'HISTORY_LIMIT',
  ]) {
    ok(new RegExp('\\b' + symbol + '\\b').test(html), 'the interface must use engine.' + symbol);
    bump('ui_engine_wiring_scans');
  }
  ok(/toDataURL|toBlob/.test(html), 'PNG export uses the canvas');
  eq(countMatches(html, /<canvas/g), 1, 'canvas is only used for the PNG export');
  ok(/hidden/.test(html), 'the export canvas is not part of the visible UI');
  ok(/devicePixelRatio/.test(html) && /Math\.min\(/.test(html), 'device pixel ratio is bounded');
  ok(/localStorage/.test(html), 'local history is stored locally');
  ok(!/password|email|name=["']user|geolocation|getUserMedia/i.test(html), 'no personal data is collected');
});

test('README documents the rules, the tests and the deterministic model honestly', () => {
  const readme = readShipped('README.md');
  ok(readme.length > 3000, 'the README actually teaches the game');
  for (const phrase of [
    'node verify.mjs',
    'GitHub Pages',
    'seed',
    'fold token',
    'integrity',
    'not physically accurate',
    'Accessibility',
    'Privacy',
    'share',
    'checksum',
    'Undo',
  ]) {
    ok(readme.includes(phrase), 'README must mention: ' + phrase);
    bump('readme_scans');
  }
  ok(!/https?:\/\/(?!localhost)/i.test(readme), 'the only URL in the README is the local server example');
});

test('every engine export is exercised by the tests or the interface', () => {
  const engine = readShipped('engine.mjs');
  const html = readShipped('index.html');
  const suite = readShipped('verify.mjs');
  const exported = [...engine.matchAll(/^export (?:const|function) ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  ok(exported.length > 40, 'the engine has a real public surface');
  const orphans = exported.filter((name) => {
    const used = new RegExp('\\b' + name + '\\b');
    return !used.test(html) && !used.test(suite.replace(/^export [^\n]*$/gm, ''));
  });
  deepEq(orphans, [], 'unexercised engine exports must be made module-private');
  bump('engine_exports', exported.length);
});

// === SUMMARY ===
const totals = {
  tests_passed: passed,
  tests_failed: failed,
  ...counters,
};
console.log('--- ORIGAMI//WAR verification ---');
for (const key of Object.keys(totals)) {
  console.log('total ' + key + '=' + totals[key]);
}
if (failed > 0) {
  console.log('');
  for (const f of failures) {
    console.log('FAILED ' + f.name + '\n  ' + f.message.split('\n').join('\n  '));
  }
  console.log('');
  console.log('RESULT: FAIL (' + failed + ' failing, ' + passed + ' passing)');
  process.exitCode = 1;
} else {
  console.log('');
  console.log('RESULT: PASS (' + passed + ' passing, 0 failing)');
  process.exitCode = 0;
}
