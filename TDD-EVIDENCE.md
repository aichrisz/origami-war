# TDD Evidence — ORIGAMI//WAR

Genuine RED-first evidence. Each entry was captured *before* the production code
for that slice existed. Nothing here is backfilled or edited after the fact.
Command is always `node verify.mjs` from the repository root.

---

## RED 1 — slice: legal crease identification

- UTC: 2026-08-30T20:41:21Z
- Command: `node verify.mjs`
- Exit code: 1

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
  '<repo>/engine.mjs' imported from
  <repo>/verify.mjs
  code: 'ERR_MODULE_NOT_FOUND'
```

Expected: the crease tests cannot run because the DOM-free engine module does
not exist yet.

---

## RED 2 — slice: coordinate reflection

- UTC: 2026-08-30T20:41:57Z
- Command: `node verify.mjs`
- Exit code: 1

```
total tests_passed=7
total tests_failed=4
FAILED reflect mirrors a coordinate across the crease line
  E.reflect is not a function
FAILED flapCellIds selects the whole moving side of the crease
  E.flapCellIds is not a function
RESULT: FAIL (4 failing, 7 passing)
```

Expected: reflection across a crease and moving-flap selection are unimplemented.

---

## RED 3 — slice: layer order and orientation

- UTC: 2026-08-30T20:42:41Z
- Command: `node verify.mjs`
- Exit code: 1

```
total tests_passed=11
total tests_failed=8
FAILED stackAt lists a stack strictly bottom-to-top by rank
  E.stackAt is not a function
FAILED relayer reverses bottom-to-top order inside every moving stack
  E.relayer is not a function
FAILED relayer toggles the face of moved cells only
  E.relayer is not a function
RESULT: FAIL (8 failing, 11 passing)
```

Expected: stack enumeration and the relayer (reverse moving stacks, lift above
stationary layers, toggle moved faces, compact ranks) do not exist yet.

---

## RED 4 — slice: fold mutation

- UTC: 2026-08-30T20:43:43Z
- Command: `node verify.mjs`
- Exit code: 1

```
total tests_passed=19
total tests_failed=8
FAILED a fold is legal only when the reflected flap fits the stationary box and touches it
  E.checkFold is not a function
FAILED legalFolds on the flat sheet is exactly the eight self-covering folds
  E.legalFolds is not a function
FAILED foldCells refuses an illegal fold and never mutates the input
  E.foldCells is not a function
RESULT: FAIL (8 failing, 19 passing)
```

Expected: fold legality checking, legal-fold enumeration and the fold mutation
itself are unimplemented.

---

## RED 5 — slice: exact fold/unfold deep round-trip

- UTC: 2026-08-30T20:44:47Z
- Command: `node verify.mjs`
- Exit code: 1

```
total tests_passed=29
total tests_failed=6
FAILED deepEqual compares structurally, not by reference
  E.deepEqual is not a function
FAILED fold history snapshots are deeply immutable
  E.foldState is not a function
FAILED unfold deep-restores the exact pre-fold topology
  E.foldState is not a function
FAILED unfold is LIFO across a stack of folds
  E.foldState is not a function
RESULT: FAIL (6 failing, 29 passing)
```

Expected: stateful fold with immutable history, LIFO unfold and structural
deep-equality are unimplemented.

---

## RED 6 — slice: stack / orthogonal contact consequence

- UTC: 2026-08-30T20:45:37Z
- Command: `node verify.mjs`
- Exit code: 1

```
total tests_passed=36
total tests_failed=5
FAILED cells in the same rendered stack are in contact
  E.inContact is not a function
FAILED folding is what brings distant paper cells into contact
  E.inContact is not a function
FAILED contactUnitIds finds live enemy and allied units in contact, never the unit itself
  E.contactUnitIds is not a function
RESULT: FAIL (5 failing, 36 passing)
```

Expected: the contact relation implied by shared stacks and orthogonally
adjacent screen coordinates does not exist yet.

---

## RED 7 — slice: strike legality and resolution

- UTC: 2026-08-30T20:47:16Z
- Command: `node verify.mjs`
- Exit code: 1

```
total tests_passed=42
total tests_failed=7
FAILED legalStrikes lists every live enemy in contact, canonically ordered
  E.legalStrikes is not a function
FAILED checkStrike enforces ownership, life and contact
  E.checkStrike is not a function
FAILED a core strike removes one integrity, and the second strike captures the core
  E.strikeState is not a function
RESULT: FAIL (7 failing, 42 passing)
```

Expected: strike legality, resolution (blade capture / core integrity loss) and
strike undo are unimplemented.

---

## RED 8 — slice: turn order, fold budget, termination

- UTC: 2026-08-30T20:48:42Z
- Command: `node verify.mjs`
- Exit code: 1

```
total tests_passed=49
total tests_failed=11
FAILED the rule constants are the settled ones
  expected 24, got undefined
FAILED a committed fold spends one fold token and passes the turn
  E.commitAction is not a function
FAILED capturing a core ends the match immediately in favour of its captor
  E.commitAction is not a function
FAILED a side with no legal action at all ends the match as a stalemate
  E.legalActions is not a function
RESULT: FAIL (11 failing, 49 passing)
```

Expected: rule constants, the single-action turn commit, the three-token fold
budget, and the termination conditions are unimplemented.

---

## RED 9 — slice: seeded legal setup

- UTC: 2026-08-30T20:50:24Z
- Command: `node verify.mjs`
- Exit code: 1

```
total tests_passed=61
total tests_failed=7
FAILED the PRNG is a pure deterministic integer generator
  E.makePRNG is not a function
FAILED createGame builds a complete, valid, deterministic starting position
  E.createGame is not a function
FAILED every seeded start over a wide sweep is legal, symmetric and strike-free
  E.createGame is not a function
RESULT: FAIL (7 failing, 61 passing)
```

Expected: the internal integer PRNG, seeded symmetric deployment and setup
validation are unimplemented.

---

## RED 10 — slice: victory and tiebreak

- UTC: 2026-08-30T20:52:23Z
- Command: `node verify.mjs`
- Exit code: 1

```
total tests_passed=71
total tests_failed=10
FAILED topLiveOwner reports the owner of the highest live unit in a stack
  E.topLiveOwner is not a function
FAILED a capped match is decided first on surviving core integrity
  E.decideCap is not a function
FAILED reaching the cap records the compared outcome, not a null
  vermilion holds a healthier core at the cap: expected "V", got null
FAILED a stalemate is scored the same way as the cap
  expected "V", got null
```

Expected: exposed-face control, the capped comparison vector and the ordered
tiebreak chain are unimplemented, so terminal outcomes stay null.

---

## RED 11 — slice: AI legal deterministic action

- UTC: 2026-08-30T20:53:47Z
- Command: `node verify.mjs`
- Exit code: 1

```
total tests_passed=82
total tests_failed=8
FAILED actionKey is a compact canonical key for every action
  E.actionKey is not a function
FAILED the AI takes an immediate core capture when one exists
  E.chooseAction is not a function
FAILED the AI avoids handing the opponent an immediate core capture
  E.aiExplain is not a function
FAILED aiExplain reports a bounded, honest account of what was considered
  E.aiExplain is not a function
```

Expected: the canonical action key, the bounded heuristic AI and its honest
explanation are unimplemented.

---

## RED 12 — slice: replay equality

- UTC: 2026-08-30T20:54:53Z
- Command: `node verify.mjs`
- Exit code: 1

```
total tests_failed=7
FAILED decodeAction is the exact inverse of actionKey
  E.decodeAction is not a function
FAILED actionLog is the canonical committed action list
  E.actionLog is not a function
FAILED the same seed and action log replay to a deep-equal state
  E.actionLog is not a function
RESULT: FAIL (7 failing, 91 passing)
```

Expected: action decoding, the canonical committed-action log and seeded replay
are unimplemented.

---

## RED 13 — slice: share/result serialization, validation and corruption

- UTC: 2026-08-30T20:56:07Z
- Command: `node verify.mjs`
- Exit code: 1

```
total tests_failed=9
FAILED serializeMatch emits a compact validated result string
  E.serializeMatch is not a function
FAILED parseMatch rejects a corrupted payload through the checksum
  E.serializeMatch is not a function
FAILED parseMatch rejects a noncanonical but correctly checksummed payload
  E.serializeMatch is not a function
FAILED local match history is bounded and carries no personal data
  expected 20, got undefined
RESULT: FAIL (9 failing, 99 passing)
```

Expected: the share string, its checksum, strict payload validation and the
bounded local history helpers are unimplemented.

---

## RED 15 — slice: pure view-model helpers (fold preview, textual mirror, fair undo)

- UTC: 2026-08-30T20:59:29Z
- Command: `node verify.mjs`
- Exit code: 1

```
total tests_passed=112
total tests_failed=10
FAILED describeAction produces a plain-language label for every legal action
  E.describeAction is not a function
FAILED previewFold reports the flap, its destination, its travel and its layering
  E.previewFold is not a function
FAILED boardMirror is a complete actionable textual mirror of the board
  E.boardMirror is not a function
FAILED fairUndo reverts exactly one unresponded action and refuses when not armed
  E.previewFold is not a function
RESULT: FAIL (10 failing, 112 passing)
```

Expected: the DOM-free view model the interface renders from - action labels,
the pre-commit fold preview, the actionable textual board mirror and the fair
undo rule - is unimplemented.

---

## RED 16 — slice: interface, README and static release scans

- UTC: 2026-08-30T21:02:45Z
- Command: `node verify.mjs`
- Exit code: 1

```
total tests_passed=124
total tests_failed=8
FAILED the repository ships only the allowed dependency-free files
  missing required file: index.html
FAILED index.html is a single offline page that imports the engine
  ENOENT: no such file or directory, open '<repo>/index.html'
FAILED index.html drives the real engine rules, not a decorative mock
  ENOENT: no such file or directory, open '<repo>/index.html'
FAILED README documents the rules, the tests and the deterministic model honestly
  ENOENT: no such file or directory, open '<repo>/README.md'
RESULT: FAIL (8 failing, 124 passing)
```

Expected: the interface and the README do not exist, so every static release
scan fails. Engine purity and dependency scans already pass at this point.

---

## RED 17 — slice: no unexercised public engine surface

- UTC: 2026-08-30T21:14:51Z
- Command: `node verify.mjs`
- Exit code: 1

```
total tests_passed=132
total tests_failed=1
FAILED every engine export is exercised by the tests or the interface
  unexercised engine exports must be made module-private: deep mismatch
    expected []
    actual   ["CELL_COUNT","deepFreeze","deepClone","snapshotState","SIDES","MODES"]
RESULT: FAIL (1 failing, 132 passing)
```

Expected: six internal helpers are exported without any caller. They are used
inside the engine, so the fix is to stop exporting them, not to delete them.

---

## GREEN checkpoint — all engine and interface slices green

- UTC: 2026-08-30T21:17Z
- Command: `node verify.mjs`
- Exit code: 0
- Result: `RESULT: PASS (133 passing, 0 failing)` with no output on stderr.

Slices completed RED-first, in order: legal crease identification; coordinate
reflection; layer order and orientation; fold mutation; exact fold/unfold deep
round-trip; stack/orthogonal contact; strike legality and resolution; turn order,
fold budget and termination; seeded legal setup; victory and tiebreak; bounded
deterministic AI; replay equality; share-string validation and corruption
rejection; property sweeps and bounded self-play; pure view-model helpers;
interface plus static release scans; public-surface cleanup.

---

## RED 18 — slice: the capped-tie initiative belongs to the opener

Measured first: across 800 bounded self-play matches the side that opens wins
only 156. The opener must act on a flat sheet where only folds exist, and the
second mover also takes the final action at the cap, so awarding the second mover
the tie-break as well compounded the advantage. The initiative is reassigned to
the opener.

- UTC: 2026-08-30T21:19:01Z
- Command: `node verify.mjs`
- Exit code: 1

```
total tests_passed=131
total tests_failed=2
FAILED the seed also fixes the initiative used to break a capped tie
  the opener holds the tie-break initiative: expected "V", got "I"
FAILED an exact tie goes to the seeded initiative, i.e. the side that opened
  the opener is compensated for having to move first: expected "V", got "I"
RESULT: FAIL (2 failing, 131 passing)
```

Expected: the initiative helper still awards the tie to the second mover.

---

## GREEN — final state

- UTC: 2026-08-30T21:20:36Z
- Command: `node verify.mjs`
- Exit code: 0
- Result: `RESULT: PASS (133 passing, 0 failing)`, nothing written to stderr.

Slices completed RED-first, in order: legal crease identification; coordinate
reflection; layer order and orientation; fold mutation; exact fold/unfold deep
round-trip; stack/orthogonal contact; strike legality and resolution; turn order,
fold budget and termination; seeded legal setup; victory and tiebreak; bounded
deterministic AI; replay equality; share-string validation and corruption
rejection; property sweeps and bounded self-play; pure view-model helpers;
interface plus static release scans; public-surface cleanup; capped-tie
initiative.

---

## RED 19 — repair: pause must suspend a pending machine reply

- UTC: 2026-08-30T21:40:57Z
- Command: `node verify.mjs`
- Exit code: 1

```
FAILED pause suspends a pending machine reply and resumes it only after the dialog closes
  pause must cancel the pending AI timer
RESULT: FAIL (1 failing, 133 passing)
```

Expected: the pause dialog was visual only; it did not cancel a pending solo AI
timer or resume that turn after every close path. The repair must make the
literal pause promise true without changing game rules.

---

## GREEN — independently repaired pause behavior

- UTC: 2026-08-30T21:43:04Z
- Command: `node verify.mjs`
- Exit code: 0
- Result: `RESULT: PASS (134 passing, 0 failing)`, nothing written to stderr.
- Browser proof: while Indigo's opening reply was pending, Pause held the match
  at action 0 beyond the AI delay; closing the dialog resumed exactly one reply
  and reached action 1.

---

## RED 20 — difficulty tiers: registry, validation, byte-identical default

- UTC: 2026-11-20T22:51:02Z
- Command: `node verify.mjs`
- Exit code: 1

```
FAILED the tier registry is declared, frozen and ordered
  deep mismatch
    expected ["APPRENTICE","ARTISAN","MASTER"]
    actual   undefined
FAILED an unknown tier is refused by both entry points
  chooseAction refuses an unknown tier
FAILED the repository ships only the allowed dependency-free files
  unexpected file in the repository: docs
RESULT: FAIL (3 failing, 134 passing)
```

Expected: the tier registry and validation do not exist yet. The third failure
is the shipped-files allowlist meeting the new `docs/` spec/plan directory; the
allowlist gains `docs` while the no-package.json/no-node_modules assertions stay
unchanged (design docs are not dependency tooling).

---

## GREEN — tier registry with byte-identical APPRENTICE default

- UTC: 2026-11-20T22:51:02Z
- Command: `node verify.mjs`
- Exit code: 0
- Result: `RESULT: PASS (137 passing, 0 failing)`.
- `AI_TIERS` and `SEARCH_BUDGETS` frozen; unknown tiers throw at both entry
  points; seeds 0-9 prove `chooseAction`/`aiExplain` with the default tier are
  deep-identical to the legacy calls. Search tiers refuse honestly until the
  next slice (private stub, no public surface yet).
