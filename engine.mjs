// ORIGAMI//WAR - pure engine.
//
// Deterministic, DOM-free, dependency-free. This module must never reference
// the DOM, storage, the network, Math.random, Date, or any wall clock: every
// value it produces is a pure function of its inputs.

export const VERSION = 'OW1';

/** Side length of the square sheet of paper. */
export const PAPER = 5;

/** Number of immutable paper cells. */
const CELL_COUNT = PAPER * PAPER;

const AXES = ['x', 'y'];

/** Immutable paper-cell id for a paper coordinate. */
export function cellId(px, py) {
  if (!Number.isInteger(px) || !Number.isInteger(py)) throw new Error('paper coordinates must be integers');
  if (px < 0 || px >= PAPER || py < 0 || py >= PAPER) throw new Error('paper coordinate out of range');
  return py * PAPER + px;
}

/** Paper coordinate of an immutable paper-cell id. */
export function paperOf(id) {
  if (!Number.isInteger(id) || id < 0 || id >= CELL_COUNT) throw new Error('unknown paper cell id');
  return { px: id % PAPER, py: Math.floor(id / PAPER) };
}

/**
 * Flat, unfolded sheet: every paper cell sits at its own screen coordinate,
 * face 0 (front) upward, with a globally unique bottom-to-top layer rank.
 */
export function initialTopology() {
  const cells = [];
  for (let id = 0; id < CELL_COUNT; id++) {
    const { px, py } = paperOf(id);
    cells.push({ id, x: px, y: py, face: 0, rank: id });
  }
  return cells;
}

/** Inclusive bounding band of the occupied screen coordinates. */
export function occupiedBounds(cells) {
  if (!Array.isArray(cells) || cells.length === 0) throw new Error('cells must be a non-empty array');
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const cell of cells) {
    if (cell.x < minX) minX = cell.x;
    if (cell.x > maxX) maxX = cell.x;
    if (cell.y < minY) minY = cell.y;
    if (cell.y > maxY) maxY = cell.y;
  }
  return { minX, maxX, minY, maxY };
}

function assertAxis(axis) {
  if (!AXES.includes(axis)) throw new Error('axis must be "x" or "y"');
}

/**
 * Integer creases that lie strictly between occupied bands on `axis`.
 * Crease `c` is the line between band c-1 and band c, so both sides are
 * guaranteed non-empty when min < c <= max.
 */
export function legalCreases(cells, axis) {
  assertAxis(axis);
  const bounds = occupiedBounds(cells);
  const min = axis === 'x' ? bounds.minX : bounds.minY;
  const max = axis === 'x' ? bounds.maxX : bounds.maxY;
  const creases = [];
  for (let c = min + 1; c <= max; c++) creases.push(c);
  return creases;
}

const DIRECTIONS = ['low', 'high'];

function assertDirection(direction) {
  if (!DIRECTIONS.includes(direction)) throw new Error('direction must be "low" or "high"');
}

/**
 * Mirror a coordinate across crease `crease` (the line between crease-1 and
 * crease, i.e. at crease - 0.5). Involutive, integer-exact.
 */
export function reflect(coord, crease) {
  return 2 * crease - 1 - coord;
}

/**
 * Ids of every cell on the moving side of the crease. `low` moves the band
 * strictly below the crease, `high` moves the band at or above it.
 */
export function flapCellIds(cells, axis, crease, direction) {
  assertAxis(axis);
  assertDirection(direction);
  if (!Number.isInteger(crease)) throw new Error('crease must be an integer');
  const ids = [];
  for (const cell of cells) {
    const coord = axis === 'x' ? cell.x : cell.y;
    const moving = direction === 'low' ? coord < crease : coord >= crease;
    if (moving) ids.push(cell.id);
  }
  ids.sort((a, b) => a - b);
  return ids;
}

/** Cell ids at one screen coordinate, ordered bottom-to-top by layer rank. */
export function stackAt(cells, x, y) {
  return cells
    .filter((cell) => cell.x === x && cell.y === y)
    .sort((a, b) => a.rank - b.rank)
    .map((cell) => cell.id);
}

/** Every occupied stack, in canonical row-major (y then x) order. */
export function stacksOf(cells) {
  const keys = new Map();
  for (const cell of cells) {
    const key = cell.y * 1000 + cell.x;
    if (!keys.has(key)) keys.set(key, { x: cell.x, y: cell.y });
  }
  return [...keys.values()]
    .sort((a, b) => (a.y - b.y) || (a.x - b.x))
    .map(({ x, y }) => ({ x, y, ids: stackAt(cells, x, y) }));
}

/**
 * Recompute layer ranks and orientations for a fold.
 *
 * Stationary cells keep their relative bottom-to-top order and are compacted to
 * the bottom of the global rank order. Moving cells are appended above them in
 * *descending* previous rank, which simultaneously reverses the bottom-to-top
 * order of every moving stack and guarantees the flap lands on top of whatever
 * it covers. Moved cells have their visible face toggled.
 *
 * The result is a dense, globally unambiguous total order (0..n-1).
 */
export function relayer(cells, movingIds) {
  const moving = new Set(movingIds);
  const stationary = cells.filter((cell) => !moving.has(cell.id)).sort((a, b) => a.rank - b.rank);
  const movers = cells.filter((cell) => moving.has(cell.id)).sort((a, b) => b.rank - a.rank);
  const next = new Array(cells.length);
  const byId = new Map(cells.map((cell, index) => [cell.id, index]));
  let rank = 0;
  for (const cell of stationary) {
    next[byId.get(cell.id)] = { id: cell.id, x: cell.x, y: cell.y, face: cell.face, rank: rank++ };
  }
  for (const cell of movers) {
    next[byId.get(cell.id)] = { id: cell.id, x: cell.x, y: cell.y, face: cell.face === 0 ? 1 : 0, rank: rank++ };
  }
  return next;
}

/**
 * Is `fold` = {axis, crease, direction} legal for topology `cells`?
 *
 * A fold is legal when:
 *  - the crease is an integer strictly inside the occupied band on that axis,
 *  - the chosen flap is non-empty,
 *  - reflecting the flap lands entirely inside the stationary bounding box,
 *  - at least one destination coordinate covers a stationary stack.
 *
 * Returns {ok:true} or {ok:false, reason}. Never throws, never mutates.
 */
export function checkFold(cells, fold) {
  if (!fold || typeof fold !== 'object') return { ok: false, reason: 'bad-fold' };
  const { axis, crease, direction } = fold;
  if (!AXES.includes(axis)) return { ok: false, reason: 'bad-axis' };
  if (!DIRECTIONS.includes(direction)) return { ok: false, reason: 'bad-direction' };
  if (!Number.isInteger(crease)) return { ok: false, reason: 'bad-crease' };
  if (!legalCreases(cells, axis).includes(crease)) return { ok: false, reason: 'crease-outside-occupied-band' };

  const flap = new Set(flapCellIds(cells, axis, crease, direction));
  if (flap.size === 0) return { ok: false, reason: 'empty-flap' };
  const stationary = cells.filter((cell) => !flap.has(cell.id));
  if (stationary.length === 0) return { ok: false, reason: 'empty-stationary' };

  const box = occupiedBounds(stationary);
  const stationaryKeys = new Set(stationary.map((cell) => cell.y * 1000 + cell.x));
  let overlaps = false;
  for (const cell of cells) {
    if (!flap.has(cell.id)) continue;
    const x = axis === 'x' ? reflect(cell.x, crease) : cell.x;
    const y = axis === 'y' ? reflect(cell.y, crease) : cell.y;
    if (x < box.minX || x > box.maxX || y < box.minY || y > box.maxY) {
      return { ok: false, reason: 'flap-outside-stationary-box' };
    }
    if (stationaryKeys.has(y * 1000 + x)) overlaps = true;
  }
  if (!overlaps) return { ok: false, reason: 'flap-covers-nothing' };
  return { ok: true };
}

/** Every legal fold for `cells`, in canonical (axis, crease, direction) order. */
export function legalFolds(cells) {
  const folds = [];
  for (const axis of AXES) {
    for (const crease of legalCreases(cells, axis)) {
      for (const direction of DIRECTIONS) {
        const fold = { axis, crease, direction };
        if (checkFold(cells, fold).ok) folds.push(fold);
      }
    }
  }
  return folds;
}

/**
 * Apply a legal fold to a topology, returning a brand new topology.
 * Throws on an illegal fold; the input is never mutated in either case.
 */
export function foldCells(cells, fold) {
  const verdict = checkFold(cells, fold);
  if (!verdict.ok) throw new Error('illegal fold: ' + verdict.reason);
  const { axis, crease, direction } = fold;
  const flap = new Set(flapCellIds(cells, axis, crease, direction));
  const moved = cells.map((cell) => {
    if (!flap.has(cell.id)) return { id: cell.id, x: cell.x, y: cell.y, face: cell.face, rank: cell.rank };
    return {
      id: cell.id,
      x: axis === 'x' ? reflect(cell.x, crease) : cell.x,
      y: axis === 'y' ? reflect(cell.y, crease) : cell.y,
      face: cell.face,
      rank: cell.rank,
    };
  });
  return relayer(moved, [...flap]);
}

// ------------------------------------------------------------ pure utilities

/** Structural deep equality for the plain JSON-shaped values used by the engine. */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const key of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

/** Recursively freeze a plain value. */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

/** Structural clone of the plain values used by the engine (unfrozen). */
function deepClone(value) {
  if (Array.isArray(value)) return value.map(deepClone);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) out[key] = deepClone(value[key]);
    return out;
  }
  return value;
}

// Mutable per-action game fields captured for LIFO restoration.
const SNAPSHOT_KEYS = ['cells', 'units', 'tokens', 'toMove', 'turn', 'status', 'outcome', 'reason'];

/** Immutable snapshot of everything an action can change. */
function snapshotState(state) {
  const snap = {};
  for (const key of SNAPSHOT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(state, key)) snap[key] = deepClone(state[key]);
  }
  return deepFreeze(snap);
}

function restoreSnapshot(state, snap) {
  const next = { ...state };
  for (const key of Object.keys(snap)) next[key] = deepClone(snap[key]);
  return next;
}

// ------------------------------------------------------------ stateful folds

/**
 * Commit a fold to a state. Returns a new state; throws on an illegal fold
 * without mutating anything. The appended history record carries a deeply
 * frozen pre-fold snapshot, which is all the immutable information LIFO
 * unfolding needs to restore the exact prior topology and game state.
 */
export function foldState(state, fold) {
  const cells = foldCells(state.cells, fold);
  const record = deepFreeze({
    type: 'FOLD',
    axis: fold.axis,
    crease: fold.crease,
    direction: fold.direction,
    before: snapshotState(state),
  });
  return { ...state, cells, history: [...state.history, record] };
}

/** LIFO unfold: pop the last fold and deep-restore the state it was applied to. */
export function unfold(state) {
  const record = state.history[state.history.length - 1];
  if (!record) throw new Error('nothing to unfold');
  if (record.type !== 'FOLD') throw new Error('last committed action is not a fold');
  const restored = restoreSnapshot(state, record.before);
  restored.history = state.history.slice(0, -1);
  return restored;
}

// ------------------------------------------------------------------- contact

function cellById(cells, id) {
  if (!Number.isInteger(id) || id < 0 || id >= CELL_COUNT) throw new Error('unknown paper cell id');
  const cell = cells.find((c) => c.id === id);
  if (!cell) throw new Error('paper cell missing from topology');
  return cell;
}

/**
 * Contact is the only consequence of overlap: two paper cells touch when they
 * sit in the same rendered stack, or in stacks at orthogonally adjacent screen
 * coordinates. A cell never contacts itself.
 */
export function inContact(cells, idA, idB) {
  if (idA === idB) return false;
  const a = cellById(cells, idA);
  const b = cellById(cells, idB);
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  if (dx === 0 && dy === 0) return true;
  return dx + dy === 1;
}

/** Every cell id in contact with `id`, ascending. */
export function contactCellIds(cells, id) {
  const out = [];
  for (const cell of cells) if (inContact(cells, id, cell.id)) out.push(cell.id);
  return out.sort((a, b) => a - b);
}

/** The unit record for a unit id. */
export function unitById(state, unitId) {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) throw new Error('unknown unit ' + unitId);
  return unit;
}

/** Live units in contact with the given live unit, in canonical unit-id order. */
export function contactUnitIds(state, unitId) {
  const self = unitById(state, unitId);
  if (!self.alive) return [];
  return state.units
    .filter((u) => u.alive && u.id !== self.id && inContact(state.cells, self.cell, u.cell))
    .map((u) => u.id)
    .sort();
}

// ------------------------------------------------------------------- strikes

const SIDES = ['V', 'I'];

/** The opposing side. */
export function other(side) {
  if (!SIDES.includes(side)) throw new Error('unknown side ' + side);
  return side === 'V' ? 'I' : 'V';
}

function findUnit(state, unitId) {
  if (typeof unitId !== 'string') return null;
  return state.units.find((u) => u.id === unitId) || null;
}

/**
 * Is `action` = {type:'STRIKE', attacker, target} legal?
 * Returns {ok:true} or {ok:false, reason}. Never throws, never mutates.
 */
export function checkStrike(state, action) {
  if (!action || typeof action !== 'object' || action.type !== 'STRIKE') return { ok: false, reason: 'bad-action' };
  const attacker = findUnit(state, action.attacker);
  const target = findUnit(state, action.target);
  if (!attacker || !target) return { ok: false, reason: 'unknown-unit' };
  if (attacker.owner !== state.toMove) return { ok: false, reason: 'attacker-not-active-side' };
  if (!attacker.alive) return { ok: false, reason: 'attacker-not-live' };
  if (target.owner === attacker.owner) return { ok: false, reason: 'target-not-enemy' };
  if (!target.alive) return { ok: false, reason: 'target-not-live' };
  if (!inContact(state.cells, attacker.cell, target.cell)) return { ok: false, reason: 'no-contact' };
  return { ok: true };
}

/** Every legal strike for the active side, in canonical (attacker, target) order. */
export function legalStrikes(state) {
  const strikes = [];
  for (const attacker of [...state.units].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (attacker.owner !== state.toMove || !attacker.alive) continue;
    for (const target of [...state.units].sort((a, b) => (a.id < b.id ? -1 : 1))) {
      const action = { type: 'STRIKE', attacker: attacker.id, target: target.id };
      if (checkStrike(state, action).ok) strikes.push(action);
    }
  }
  return strikes;
}

/**
 * Commit a strike. A blade strike captures the blade; a core strike removes one
 * integrity and captures the core at integrity 0. Topology is never touched.
 * Throws on an illegal strike without mutating anything.
 */
export function strikeState(state, action) {
  const verdict = checkStrike(state, action);
  if (!verdict.ok) throw new Error('illegal strike: ' + verdict.reason);
  const units = state.units.map((unit) => {
    if (unit.id !== action.target) return { ...unit };
    if (unit.kind === 'BLADE') return { ...unit, alive: false };
    const integrity = unit.integrity - 1;
    return { ...unit, integrity, alive: integrity > 0 };
  });
  const record = deepFreeze({
    type: 'STRIKE',
    attacker: action.attacker,
    target: action.target,
    before: snapshotState(state),
  });
  return { ...state, units, history: [...state.history, record] };
}

/** Revert the most recent committed action of any kind (LIFO). */
export function undoLast(state) {
  const record = state.history[state.history.length - 1];
  if (!record) throw new Error('nothing to undo');
  const restored = restoreSnapshot(state, record.before);
  restored.history = state.history.slice(0, -1);
  return restored;
}

// ------------------------------------------------- turns, budget, termination

/** Committed actions allowed in one match (both sides combined). */
export const TURN_CAP = 24;

/** Fold tokens each side starts with. */
export const FOLD_TOKENS = 3;

/** Starting core integrity. */
export const CORE_INTEGRITY = 2;

/** Blades each side starts with. */
export const BLADES_PER_SIDE = 3;

/** Legality of any action for the state it would be committed to. */
export function checkAction(state, action) {
  if (!action || typeof action !== 'object') return { ok: false, reason: 'bad-action' };
  if (state.status !== 'ACTIVE') return { ok: false, reason: 'match-over' };
  if (action.type === 'FOLD') {
    if ((state.tokens[state.toMove] || 0) <= 0) return { ok: false, reason: 'no-fold-tokens' };
    return checkFold(state.cells, action);
  }
  if (action.type === 'STRIKE') return checkStrike(state, action);
  return { ok: false, reason: 'bad-action-type' };
}

/** Every legal action for the active side: folds in canonical order, then strikes. */
export function legalActions(state) {
  if (state.status !== 'ACTIVE') return [];
  const actions = [];
  if ((state.tokens[state.toMove] || 0) > 0) {
    for (const fold of legalFolds(state.cells)) actions.push({ type: 'FOLD', ...fold });
  }
  for (const strike of legalStrikes(state)) actions.push(strike);
  return actions;
}

function deadCoreOwner(state) {
  const dead = state.units.find((u) => u.kind === 'CORE' && !u.alive);
  return dead ? dead.owner : null;
}

/**
 * Close the match if it is over: a captured core wins immediately, otherwise the
 * action cap or a side with no legal action at all ends it on comparison.
 */
export function settleTermination(state) {
  if (state.status !== 'ACTIVE') return state;
  const loser = deadCoreOwner(state);
  if (loser) return { ...state, status: 'DONE', outcome: other(loser), reason: 'CORE' };
  if (state.turn >= TURN_CAP) return { ...state, status: 'DONE', outcome: decideCap(state), reason: 'CAP' };
  if (legalActions(state).length === 0) {
    return { ...state, status: 'DONE', outcome: decideCap(state), reason: 'STALEMATE' };
  }
  return state;
}

/**
 * Commit exactly one legal action, advancing the turn counter and passing play.
 * Throws on an illegal action without mutating anything.
 */
export function commitAction(state, action) {
  const verdict = checkAction(state, action);
  if (!verdict.ok) throw new Error('illegal action: ' + verdict.reason);
  let next;
  if (action.type === 'FOLD') {
    next = foldState(state, action);
    next.tokens = { ...state.tokens, [state.toMove]: state.tokens[state.toMove] - 1 };
  } else {
    next = strikeState(state, action);
  }
  next.turn = state.turn + 1;
  next.toMove = other(state.toMove);
  return settleTermination(next);
}

// -------------------------------------------------------- seeded deployment

const MODES = ['SOLO', 'PASS'];

/**
 * Deterministic integer PRNG (mulberry32). The engine never uses Math.random,
 * Date or any other ambient source of entropy.
 */
export function makePRNG(seed) {
  if (!Number.isInteger(seed) || seed < 0) throw new Error('seed must be a non-negative integer');
  let s = seed >>> 0;
  function nextU32() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return (t ^ (t >>> 14)) >>> 0;
  }
  function nextInt(bound) {
    if (!Number.isInteger(bound) || bound <= 0) throw new Error('bound must be a positive integer');
    return nextU32() % bound;
  }
  return { nextU32, nextInt };
}

/** 180-degree rotation of a paper cell, used to mirror the two deployments. */
export function rotateCell(id) {
  const { px, py } = paperOf(id);
  return cellId(PAPER - 1 - px, PAPER - 1 - py);
}

const V_IDS = ['A', 'B', 'C', 'D'];
const I_IDS = ['E', 'F', 'G', 'H'];

/**
 * Is this a fair, legal starting position? Checks the roster, distinct
 * placements, rotational symmetry and the absence of any turn-one strike.
 */
export function validateSetup(state) {
  if (!state || !Array.isArray(state.units) || state.units.length !== 8) {
    return { ok: false, reason: 'wrong-unit-roster' };
  }
  for (const side of SIDES) {
    const mine = state.units.filter((u) => u.owner === side);
    if (mine.length !== 4) return { ok: false, reason: 'wrong-unit-roster' };
    if (mine.filter((u) => u.kind === 'CORE').length !== 1) return { ok: false, reason: 'wrong-unit-roster' };
    if (mine.filter((u) => u.kind === 'BLADE').length !== BLADES_PER_SIDE) {
      return { ok: false, reason: 'wrong-unit-roster' };
    }
    const core = mine.find((u) => u.kind === 'CORE');
    if (core.integrity !== CORE_INTEGRITY || !core.alive) return { ok: false, reason: 'wrong-unit-roster' };
    if (!mine.every((u) => u.alive)) return { ok: false, reason: 'wrong-unit-roster' };
  }
  const cells = state.units.map((u) => u.cell);
  if (new Set(cells).size !== cells.length) return { ok: false, reason: 'duplicate-placement' };
  for (let i = 0; i < 4; i++) {
    const v = state.units.find((u) => u.id === V_IDS[i]);
    const enemy = state.units.find((u) => u.id === I_IDS[i]);
    if (!v || !enemy || enemy.cell !== rotateCell(v.cell)) return { ok: false, reason: 'not-rotationally-symmetric' };
  }
  if (legalFolds(state.cells).length === 0) return { ok: false, reason: 'no-opening-fold' };
  for (const side of SIDES) {
    if (legalStrikes({ ...state, toMove: side, status: 'ACTIVE' }).length > 0) {
      return { ok: false, reason: 'initial-contact' };
    }
  }
  return { ok: true };
}

/**
 * The side that wins an otherwise exact capped tie: the one that opened. The
 * opener has to act on a flat sheet where no strike exists yet, and the second
 * mover takes the final action at the cap, so the initiative compensates it.
 */
export function tiebreakSide(state) {
  return state.firstMover;
}

/**
 * Build the seeded starting position. Vermilion deploys in paper rows 0-1 with
 * its core on row 0; Indigo is the exact 180-degree rotation, which guarantees
 * distinct placements and two clear rows between the armies, so no strike is
 * available before anyone has folded.
 */
export function createGame(seed, mode = 'SOLO') {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('seed must be a uint32 integer');
  if (!MODES.includes(mode)) throw new Error('unknown mode ' + mode);
  const rng = makePRNG(seed);
  const firstMover = rng.nextInt(2) === 0 ? 'V' : 'I';
  const coreCell = cellId(rng.nextInt(PAPER), 0);
  const candidates = [];
  for (let py = 0; py <= 1; py++) {
    for (let px = 0; px < PAPER; px++) {
      const id = cellId(px, py);
      if (id !== coreCell) candidates.push(id);
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    const tmp = candidates[i];
    candidates[i] = candidates[j];
    candidates[j] = tmp;
  }
  const bladeCells = candidates.slice(0, BLADES_PER_SIDE).sort((a, b) => a - b);
  const units = [];
  units.push({ id: 'A', owner: 'V', kind: 'CORE', cell: coreCell, alive: true, integrity: CORE_INTEGRITY });
  bladeCells.forEach((cell, i) => {
    units.push({ id: V_IDS[i + 1], owner: 'V', kind: 'BLADE', cell, alive: true, integrity: 0 });
  });
  units.push({ id: 'E', owner: 'I', kind: 'CORE', cell: rotateCell(coreCell), alive: true, integrity: CORE_INTEGRITY });
  bladeCells.forEach((cell, i) => {
    units.push({ id: I_IDS[i + 1], owner: 'I', kind: 'BLADE', cell: rotateCell(cell), alive: true, integrity: 0 });
  });

  const state = {
    version: VERSION,
    seed,
    mode,
    firstMover,
    cells: initialTopology(),
    units,
    tokens: { V: FOLD_TOKENS, I: FOLD_TOKENS },
    toMove: firstMover,
    turn: 0,
    status: 'ACTIVE',
    outcome: null,
    reason: null,
    history: [],
  };
  const verdict = validateSetup(state);
  if (!verdict.ok) throw new Error('seeded setup is invalid: ' + verdict.reason);
  return state;
}

// -------------------------------------------------- victory and cap tiebreak

/** Owner of the topmost live unit in a stack, or null if it shows no unit. */
export function topLiveOwner(state, x, y) {
  const ids = stackAt(state.cells, x, y);
  for (let i = ids.length - 1; i >= 0; i--) {
    const unit = state.units.find((u) => u.alive && u.cell === ids[i]);
    if (unit) return unit.owner;
  }
  return null;
}

/** Number of stacks whose exposed top face is controlled by each side. */
export function exposedControl(state) {
  const counts = { V: 0, I: 0 };
  for (const stack of stacksOf(state.cells)) {
    const owner = topLiveOwner(state, stack.x, stack.y);
    if (owner) counts[owner] += 1;
  }
  return counts;
}

/** The full capped-match comparison vector for both sides. */
export function capScore(state) {
  const exposed = exposedControl(state);
  const score = {};
  for (const side of SIDES) {
    const core = state.units.find((u) => u.owner === side && u.kind === 'CORE');
    score[side] = {
      integrity: core && core.alive ? core.integrity : 0,
      blades: state.units.filter((u) => u.owner === side && u.kind === 'BLADE' && u.alive).length,
      exposed: exposed[side],
    };
  }
  return score;
}

/**
 * Decide a match that ran out of actions: surviving core integrity, then
 * surviving blades, then controlled exposed top faces, then the seed-derived
 * initiative (which belongs to the side that opened). A state carrying no
 * initiative at all is a draw.
 */
export function decideCap(state) {
  const score = capScore(state);
  for (const key of ['integrity', 'blades', 'exposed']) {
    if (score.V[key] > score.I[key]) return 'V';
    if (score.I[key] > score.V[key]) return 'I';
  }
  if (state.firstMover === 'V' || state.firstMover === 'I') return tiebreakSide(state);
  return 'D';
}

// ------------------------------------------------------ canonical action keys

/**
 * Compact canonical key for an action. Fold keys are 4 characters
 * (`F` axis crease direction-initial), strike keys are 3 (`S` attacker target),
 * so a concatenation of keys parses unambiguously.
 */
export function actionKey(action) {
  if (!action || typeof action !== 'object') throw new Error('bad action');
  if (action.type === 'FOLD') {
    if (!AXES.includes(action.axis)) throw new Error('bad axis');
    if (!DIRECTIONS.includes(action.direction)) throw new Error('bad direction');
    if (!Number.isInteger(action.crease) || action.crease < 0 || action.crease > 9) throw new Error('bad crease');
    return 'F' + action.axis + action.crease + (action.direction === 'low' ? 'l' : 'h');
  }
  if (action.type === 'STRIKE') {
    const ids = [...V_IDS, ...I_IDS];
    if (!ids.includes(action.attacker) || !ids.includes(action.target)) throw new Error('bad unit id');
    return 'S' + action.attacker + action.target;
  }
  throw new Error('unknown action type');
}

// --------------------------------------------------------------------- the AI
//
// Honest description: this is a bounded two-ply heuristic, not a deep search.
// It enumerates its own legal actions, plays each one, and looks exactly one
// opponent reply deep - only far enough to notice an immediate core capture.
// Everything else is a static integer score. It does not plan multi-move
// combinations and it cannot see beyond that single reply.

/** Hard cap on the AI's own branching factor. */
export const AI_ACTION_LIMIT = 64;

/** Hard cap on the opponent replies examined per candidate action. */
export const AI_REPLY_LIMIT = 64;

function coreOf(state, side) {
  return state.units.find((u) => u.owner === side && u.kind === 'CORE');
}

function bladesAlive(state, side) {
  return state.units.filter((u) => u.owner === side && u.kind === 'BLADE' && u.alive).length;
}

function contactPotential(state, side) {
  let count = 0;
  for (const unit of state.units) {
    if (unit.owner !== side || !unit.alive) continue;
    for (const enemy of state.units) {
      if (enemy.owner === side || !enemy.alive) continue;
      if (inContact(state.cells, unit.cell, enemy.cell)) count += 1;
    }
  }
  return count;
}

function winsImmediately(state, action, side) {
  const next = commitAction(state, action);
  return next.status === 'DONE' && next.reason === 'CORE' && next.outcome === side;
}

function opponentCanCapture(state) {
  if (state.status !== 'ACTIVE') return false;
  const replies = legalActions(state).slice(0, AI_REPLY_LIMIT);
  for (const reply of replies) {
    if (winsImmediately(state, reply, state.toMove)) return true;
  }
  return false;
}

function scoreAfter(state, side) {
  const me = coreOf(state, side);
  const foe = coreOf(state, other(side));
  const exposed = exposedControl(state);
  let score = 0;
  score += 1000 * (CORE_INTEGRITY - (foe.alive ? foe.integrity : 0));
  score -= 900 * (CORE_INTEGRITY - (me.alive ? me.integrity : 0));
  score += 300 * (BLADES_PER_SIDE - bladesAlive(state, other(side)));
  score -= 250 * (BLADES_PER_SIDE - bladesAlive(state, side));
  score += 12 * contactPotential(state, side);
  score -= 10 * contactPotential(state, other(side));
  score += 5 * (exposed[side] - exposed[other(side)]);
  score += 7 * (state.tokens[side] || 0);
  if (state.status === 'DONE') {
    if (state.outcome === side) score += 5000;
    else if (state.outcome === other(side)) score -= 5000;
  }
  return score;
}

/**
 * Full, honest account of one AI decision: what it looked at, how it scored,
 * which actions it judged unsafe and which it chose. Pure and bounded.
 */
export function aiExplain(state) {
  const side = state.toMove;
  const actions = legalActions(state).slice(0, AI_ACTION_LIMIT);
  if (actions.length === 0) throw new Error('no legal action to choose');
  const winning = [];
  const unsafe = [];
  const scores = [];
  for (const action of actions) {
    const key = actionKey(action);
    const next = commitAction(state, action);
    if (next.status === 'DONE' && next.reason === 'CORE' && next.outcome === side) winning.push(key);
    if (opponentCanCapture(next)) unsafe.push(key);
    scores.push({ key, score: scoreAfter(next, side) });
  }
  let chosen;
  if (winning.length > 0) {
    chosen = [...winning].sort()[0];
  } else {
    const safeKeys = new Set(scores.map((s) => s.key).filter((key) => !unsafe.includes(key)));
    const pool = safeKeys.size > 0 ? scores.filter((s) => safeKeys.has(s.key)) : scores;
    chosen = [...pool].sort((a, b) => (b.score - a.score) || (a.key < b.key ? -1 : 1))[0].key;
  }
  return { side, depth: 2, considered: actions.length, winning, unsafe, scores, chosen };
}

/** The AI's action for a state. Same state always yields the same legal action. */
export function chooseAction(state) {
  const explained = aiExplain(state);
  const action = legalActions(state).slice(0, AI_ACTION_LIMIT).find((a) => actionKey(a) === explained.chosen);
  if (!action) throw new Error('ai failed to resolve its own choice');
  return action;
}

// ------------------------------------------------------------ log and replay

const UNIT_IDS = [...V_IDS, ...I_IDS];

/** Parse one canonical action key. Throws on anything non-canonical. */
export function decodeAction(key) {
  if (typeof key !== 'string') throw new Error('action key must be a string');
  if (key[0] === 'F') {
    if (key.length !== 4) throw new Error('bad fold key length');
    const axis = key[1];
    const crease = key[2];
    const dir = key[3];
    if (!AXES.includes(axis)) throw new Error('bad fold axis');
    if (!/^[0-9]$/.test(crease)) throw new Error('bad fold crease');
    if (dir !== 'l' && dir !== 'h') throw new Error('bad fold direction');
    return { type: 'FOLD', axis, crease: Number(crease), direction: dir === 'l' ? 'low' : 'high' };
  }
  if (key[0] === 'S') {
    if (key.length !== 3) throw new Error('bad strike key length');
    const attacker = key[1];
    const target = key[2];
    if (!UNIT_IDS.includes(attacker) || !UNIT_IDS.includes(target)) throw new Error('bad unit id');
    if (attacker === target) throw new Error('a unit cannot strike itself');
    return { type: 'STRIKE', attacker, target };
  }
  throw new Error('unknown action key');
}

/** Parse a concatenation of canonical action keys. Rejects any trailing garbage. */
export function decodeActionList(text) {
  if (typeof text !== 'string') throw new Error('action list must be a string');
  const actions = [];
  let i = 0;
  while (i < text.length) {
    const width = text[i] === 'F' ? 4 : text[i] === 'S' ? 3 : 0;
    if (width === 0) throw new Error('unknown action key');
    if (i + width > text.length) throw new Error('truncated action key');
    actions.push(decodeAction(text.slice(i, i + width)));
    i += width;
  }
  return actions;
}

/** Encode a list of actions back to its canonical concatenated form. */
export function encodeActionList(actions) {
  return actions.map(actionKey).join('');
}

/** Canonical keys of every action committed so far, oldest first. */
export function actionLog(state) {
  return state.history.map((record) => actionKey(record));
}

/**
 * Rebuild a match from its seed, mode and canonical action log. Throws if the
 * log contains anything the rules do not allow at that point.
 */
export function replay(seed, mode, log) {
  let state = createGame(seed, mode);
  for (const action of decodeActionList(log)) state = commitAction(state, action);
  return state;
}

// ----------------------------------------------------- share / result strings
//
// OW1-<seed base36>-<S|P>-<canonical actions>-<V|I|D>-<checksum base36>

const MODE_CODES = { SOLO: 'S', PASS: 'P' };
const MODE_NAMES = { S: 'SOLO', P: 'PASS' };
const OUTCOMES = ['V', 'I', 'D'];

/** FNV-1a 32-bit checksum, rendered lowercase base36. */
export function checksum(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(36);
}

/** The canonical share/result string for a completed match. */
export function serializeMatch(state) {
  if (state.status !== 'DONE') throw new Error('only a completed match can be shared');
  if (!OUTCOMES.includes(state.outcome)) throw new Error('completed match has no valid outcome');
  const body = [
    VERSION,
    state.seed.toString(36),
    MODE_CODES[state.mode],
    actionLog(state).join(''),
    state.outcome,
  ].join('-');
  return body + '-' + checksum(body);
}

/**
 * Strictly validate a share/result string. Malformed, corrupted, impossible,
 * noncanonical and trailing-garbage payloads are all rejected with a reason.
 */
export function parseMatch(text) {
  if (typeof text !== 'string') return { ok: false, reason: 'not-a-string' };
  if (/\s/.test(text)) return { ok: false, reason: 'contains-whitespace' };
  const parts = text.split('-');
  if (parts.length !== 6) return { ok: false, reason: 'bad-field-count' };
  const [version, seedText, modeCode, log, outcome, sum] = parts;
  if (version !== VERSION) return { ok: false, reason: 'bad-version' };
  if (!/^[0-9a-z]{1,7}$/.test(seedText)) return { ok: false, reason: 'bad-seed' };
  const seed = Number.parseInt(seedText, 36);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return { ok: false, reason: 'bad-seed' };
  if (!Object.prototype.hasOwnProperty.call(MODE_NAMES, modeCode)) return { ok: false, reason: 'bad-mode' };
  if (!OUTCOMES.includes(outcome)) return { ok: false, reason: 'bad-outcome' };
  if (!/^[0-9a-z]+$/.test(sum)) return { ok: false, reason: 'bad-checksum-format' };
  if (checksum(parts.slice(0, 5).join('-')) !== sum) return { ok: false, reason: 'checksum-mismatch' };

  let state;
  try {
    state = replay(seed, MODE_NAMES[modeCode], log);
  } catch {
    return { ok: false, reason: 'illegal-log' };
  }
  if (state.status !== 'DONE') return { ok: false, reason: 'unfinished' };
  if (state.outcome !== outcome) return { ok: false, reason: 'outcome-mismatch' };
  if (serializeMatch(state) !== text) return { ok: false, reason: 'noncanonical' };
  return { ok: true, seed, mode: MODE_NAMES[modeCode], log, outcome, state };
}

// ------------------------------------------------------- bounded local history

/** Most completed matches kept in local history. */
export const HISTORY_LIMIT = 20;

/** The only match facts worth keeping. No personal data, no timestamps. */
export function matchRecord(state) {
  return {
    seed: state.seed,
    mode: state.mode,
    outcome: state.outcome,
    reason: state.reason,
    actions: state.turn,
    share: serializeMatch(state),
  };
}

/** Prepend a record to local history, newest first, bounded to HISTORY_LIMIT. */
export function pushMatchRecord(list, record) {
  return [record, ...(Array.isArray(list) ? list : [])].slice(0, HISTORY_LIMIT);
}

// -------------------------------------------------------------- view helpers
//
// Everything below is still DOM-free. The interface renders these plain values;
// it holds no rules of its own.

const SIDE_NAMES = { V: 'Vermilion', I: 'Indigo' };

/** Full faction name, so nothing depends on colour alone. */
export function sideName(side) {
  if (!SIDE_NAMES[side]) throw new Error('unknown side ' + side);
  return SIDE_NAMES[side];
}

/** Readable label for a unit, including core integrity. */
export function unitLabel(state, unitId) {
  const unit = unitById(state, unitId);
  const kind = unit.kind === 'CORE' ? 'core' : 'blade';
  const base = sideName(unit.owner) + ' ' + kind + ' ' + unit.id;
  return unit.kind === 'CORE' ? base + ' (integrity ' + unit.integrity + ')' : base;
}

/** Which way a flap travels when it folds over. */
export function moveOverDirection(axis, direction) {
  assertAxis(axis);
  assertDirection(direction);
  if (axis === 'x') return direction === 'low' ? 'right' : 'left';
  return direction === 'low' ? 'down' : 'up';
}

function bandLabel(cells, axis, crease, direction) {
  const values = [
    ...new Set(
      flapCellIds(cells, axis, crease, direction).map((id) => {
        const cell = cells.find((c) => c.id === id);
        return axis === 'x' ? cell.x : cell.y;
      }),
    ),
  ].sort((a, b) => a - b);
  const word = axis === 'x' ? 'column' : 'row';
  if (values.length === 1) return word + ' ' + values[0];
  return word + 's ' + values[0] + '-' + values[values.length - 1];
}

/** Plain-language description of an action, used for accessible controls. */
export function describeAction(state, action) {
  if (action.type === 'FOLD') {
    return (
      'Fold ' +
      bandLabel(state.cells, action.axis, action.crease, action.direction) +
      ' ' +
      moveOverDirection(action.axis, action.direction) +
      ' over crease ' +
      action.axis +
      action.crease
    );
  }
  if (action.type === 'STRIKE') {
    return 'Strike: ' + unitLabel(state, action.attacker) + ' hits ' + unitLabel(state, action.target);
  }
  throw new Error('unknown action type');
}

function crossSideContacts(cells, units) {
  const pairs = [];
  const live = units.filter((u) => u.alive);
  for (const a of live) {
    for (const b of live) {
      if (a.id >= b.id || a.owner === b.owner) continue;
      if (inContact(cells, a.cell, b.cell)) pairs.push({ a: a.id, b: b.id });
    }
  }
  return pairs.sort((p, q) => (p.a + p.b < q.a + q.b ? -1 : 1));
}

/**
 * Everything a pre-commit fold preview needs: the selected flap, where each of
 * its cells lands, which way it travels, the resulting layering, and the strike
 * contacts the fold would create. Pure; never mutates; explains refusals.
 */
export function previewFold(state, fold) {
  const action = { type: 'FOLD', axis: fold.axis, crease: fold.crease, direction: fold.direction };
  const verdict = checkAction(state, action);
  if (!verdict.ok) return { ok: false, reason: verdict.reason, ...action };
  const { axis, crease, direction } = fold;
  const flapIds = flapCellIds(state.cells, axis, crease, direction);
  const flapSet = new Set(flapIds);
  const nextCells = foldCells(state.cells, fold);
  const flap = flapIds.map((id) => {
    const from = state.cells.find((c) => c.id === id);
    const to = nextCells.find((c) => c.id === id);
    return {
      id,
      from: { x: from.x, y: from.y },
      to: { x: to.x, y: to.y },
      face: from.face,
      newFace: to.face,
    };
  });
  const destKeys = new Set();
  const destinations = [];
  for (const item of flap) {
    const key = item.to.y * 1000 + item.to.x;
    if (!destKeys.has(key)) {
      destKeys.add(key);
      destinations.push({ x: item.to.x, y: item.to.y });
    }
  }
  destinations.sort((a, b) => (a.y - b.y) || (a.x - b.x));
  const stationaryKeys = new Set(
    state.cells.filter((c) => !flapSet.has(c.id)).map((c) => c.y * 1000 + c.x),
  );
  const overlaps = destinations.filter((d) => stationaryKeys.has(d.y * 1000 + d.x));
  const stacksAfter = stacksOf(nextCells).map((stack) => ({
    x: stack.x,
    y: stack.y,
    ids: stack.ids,
    movingIds: stack.ids.filter((id) => flapSet.has(id)),
  }));

  const before = crossSideContacts(state.cells, state.units);
  const beforeKeys = new Set(before.map((p) => p.a + p.b));
  const after = crossSideContacts(nextCells, state.units);
  const newContacts = after.filter((p) => !beforeKeys.has(p.a + p.b));
  const nextState = { ...state, cells: nextCells };
  const newStrikes = [];
  for (const pair of newContacts) {
    for (const [attacker, target] of [[pair.a, pair.b], [pair.b, pair.a]]) {
      const side = unitById(nextState, attacker).owner;
      if (checkStrike({ ...nextState, toMove: side, status: 'ACTIVE' }, { type: 'STRIKE', attacker, target }).ok) {
        newStrikes.push({ attacker, target, side });
      }
    }
  }
  return {
    ok: true,
    reason: null,
    axis,
    crease,
    direction,
    movesOver: moveOverDirection(axis, direction),
    flap,
    flapIds,
    stationaryIds: state.cells.filter((c) => !flapSet.has(c.id)).map((c) => c.id).sort((a, b) => a - b),
    destinations,
    overlaps,
    stacksAfter,
    newContacts,
    newStrikes,
  };
}

/**
 * Actionable textual mirror of the whole board and topology: one entry per
 * stack, bottom-to-top, plus the legal actions as selectable keys and labels.
 */
export function boardMirror(state) {
  const stacks = stacksOf(state.cells).map((stack) => {
    const layers = stack.ids.map((id) => {
      const cell = state.cells.find((c) => c.id === id);
      const { px, py } = paperOf(id);
      const unit = state.units.find((u) => u.cell === id);
      return {
        id,
        px,
        py,
        face: cell.face,
        rank: cell.rank,
        unit: unit
          ? { id: unit.id, owner: unit.owner, kind: unit.kind, integrity: unit.integrity, alive: unit.alive }
          : null,
      };
    });
    const occupants = layers
      .filter((l) => l.unit && l.unit.alive)
      .map((l) => unitLabel(state, l.unit.id));
    const text =
      'Square ' +
      stack.x +
      ',' +
      stack.y +
      ': ' +
      layers.length +
      (layers.length === 1 ? ' layer' : ' layers') +
      ' (bottom to top ' +
      layers.map((l) => 'cell ' + l.px + ',' + l.py + ' face ' + (l.face === 0 ? 'front' : 'back')).join('; ') +
      ')' +
      (occupants.length ? '. Holds ' + occupants.join(', ') + '.' : '. Empty.');
    return { x: stack.x, y: stack.y, layers, topOwner: topLiveOwner(state, stack.x, stack.y), text };
  });
  return {
    bounds: occupiedBounds(state.cells),
    stacks,
    units: state.units.map((u) => ({ ...u, label: unitLabel(state, u.id) })),
    tokens: { ...state.tokens },
    toMove: state.toMove,
    turn: state.turn,
    cap: TURN_CAP,
    status: state.status,
    outcome: state.outcome,
    reason: state.reason,
    score: capScore(state),
    actions: legalActions(state).map((action) => ({
      key: actionKey(action),
      type: action.type,
      label: describeAction(state, action),
      action,
    })),
  };
}

// ------------------------------------------------------------------ fair undo
//
// Undo is only fair while the committed action is still unanswered: in solo
// before the AI replies, in pass-and-play before the device changes hands. The
// interface arms undo at exactly those moments and disarms it otherwise; the
// engine enforces that an armed undo reverts one whole action.

/** Can the interface offer undo right now? */
export function undoAvailable(state, armed) {
  return Boolean(armed) && Array.isArray(state.history) && state.history.length > 0;
}

/** Revert the single unresponded action. Throws unless undo is armed and possible. */
export function fairUndo(state, armed) {
  if (!undoAvailable(state, armed)) throw new Error('undo is not available');
  return undoLast(state);
}
