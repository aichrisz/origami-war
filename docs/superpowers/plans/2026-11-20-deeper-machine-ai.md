# Deeper Machine AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native execution — Abel delegated the lane; tasks share one tight engine interface) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. TDD per superpowers:test-driven-development: every RED is watched failing before GREEN; trail appended to `TDD-EVIDENCE.md` as RED 20+.

**Goal:** Add combination-planning search (negamax α-β, iterative deepening, node budgets) and three difficulty tiers to the ORIGAMI//WAR machine, default byte-identical to today.

**Architecture:** Pure engine additions only (`engine.mjs`): tier registry, `searchExplain(state, limits)`, extended `chooseAction`/`aiExplain` with optional tier. UI (`index.html`) gains a persisted, labelled difficulty radio group wired into `scheduleAI`. `verify.mjs` gains behaviour tests + static scans; README/help text rewritten honestly.

**Tech Stack:** Dependency-free ES modules, Node test suite (`node verify.mjs`), static HTML/CSS/JS, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-11-20-deeper-machine-ai-design.md`

## Global Constraints

- All 134 existing tests pass with assertions unmodified; default tier APPRENTICE reproduces today's `chooseAction`/`aiExplain` exactly.
- Engine stays pure/DOM-free; no `Math.random`, `Date`, or wall-clock in decisions; budgets are node counts.
- `commitAction` is the only rules transition used by search.
- OW1 share format, `matchRecord`, history schema unchanged.
- Integer scores only; ties → lexicographically smallest canonical action key.
- No new dependencies; no personal data; accessible controls (labelled, ≥44px targets, keyboard).
- Tier budgets: ARTISAN {depth 4, nodes 2500}; MASTER {depth 6, nodes 6000}.

## Review Focus

1. Corrupted/absent stored difficulty → silent fallback to APPRENTICE, no crash (Task 4 test).
2. Budget exhausted before any depth completes → still returns a legal action via deterministic root-static fallback (Task 2 test, `searchExplain` with nodes=1).
3. Exactly one legal root action → returned unchanged, no budget pathology (Task 2 test).
4. Difficulty changed while an AI turn is pending → tier read at fire time; pause/resume never double-fires (Task 4 test; existing pause scan stays green).
5. PASS mode → radios disabled, no search ever scheduled (Task 4 test).

---

### Task 1: Tier registry + API extension (RED 20)

**Files:** Modify `engine.mjs` (AI section, ~L736-839); Test `verify.mjs` (new slice 13 after slice 12).

**Interfaces:**
- Produces: `AI_TIERS` frozen `['APPRENTICE','ARTISAN','MASTER']`; `SEARCH_BUDGETS` frozen `{ARTISAN:{depth:4,nodes:2500},MASTER:{depth:6,nodes:6000}}`; `chooseAction(state, tier='APPRENTICE')`; `aiExplain(state, tier='APPRENTICE')`; `searchExplain(state, limits)` (Task 2). Unknown tier throws `Error('unknown tier ...')`; limits validated: integer depth 2..12, integer nodes 1..200000, else throw.

- [ ] **Step 1: RED 20 tests** — `AI_TIERS` exact array + frozen; `SEARCH_BUDGETS` exact values + frozen; `chooseAction(state,'NOPE')` and `aiExplain(state,'NOPE')` throw; for seeds 0..9 `chooseAction(createGame(seed,'SOLO'),'APPRENTICE')` deep-equals `chooseAction(createGame(seed,'SOLO'))` and `aiExplain(...,'APPRENTICE')` deep-equals `aiExplain(...)` (default identity).
- [ ] **Step 2:** Run `node verify.mjs` → new tests FAIL (exports missing), 134 old pass. Record RED 20 in TDD-EVIDENCE.md (UTC, command, exit, failure text).
- [ ] **Step 3: GREEN** — add exports; thread optional tier through `chooseAction`/`aiExplain`; APPRENTICE path = existing code untouched; search tiers delegate to `searchExplain` (stub throwing 'search not implemented' until Task 2 — RED 20 tests only exercise APPRENTICE + validation, so suite goes green).
- [ ] **Step 4:** Run → PASS (134 + new). Record GREEN.
- [ ] **Step 5:** Commit `feat: AI tier registry with byte-identical default`.

### Task 2: Search core (RED 21–24, 26)

**Files:** Modify `engine.mjs`; Test `verify.mjs`.

**Interfaces:**
- Consumes: Task 1 registry; existing `legalActions`, `commitAction`, `actionKey`, `scoreAfter` (private), `opponentCanCapture` (private), `decideCap`, `capScore`, `exposedControl`.
- Produces: `searchExplain(state, limits)` → `{side, depth, nodes, budget, considered, winning, unsafe, scores, chosen}`; `aiExplain` search tiers return that + `tier`; `chooseAction` search tiers resolve `chosen`.

- [ ] **Step 1: RED 21–24, 26 tests (all written before any search code)** — RED 21 combination: position (verified by probe): manualGame with A(2,0)i2, B(4,3), C(1,0), D(0,3), E(2,3)i1, F(4,4), G(4,0), H(0,4), tokens {V:3,I:0}, toMove V. Assert: fold `Fy2l` legal; after it, every Indigo reply leaves V an immediate CORE win (helper loops replies). Assert `chooseAction(state,'ARTISAN')` and `'MASTER'` each pick a move preserving that forced-win property; assert APPRENTICE's choice does NOT preserve it (it plays SBF). RED 22/23/24/26 per steps 5–8 below. All fail on the Task 1 stub.
- [ ] **Step 2:** Run → FAIL (search stub throws). Record RED 21 (and the other RED failure lines) in TDD-EVIDENCE.md.
- [ ] **Step 3: GREEN** — implement `searchExplain`: negamax fail-soft α-β; node counter with sentinel throw on budget; iterative deepening 2..limits.depth keeping last completed depth's best root key + root scores; ordering = child static eval from parent perspective desc, key asc, child states cached (one commit per child); previous iteration best first at root; no completed depth → root-static fallback (depth reported 1). Leaf eval = `scoreAfter(state, state.toMove)` (base). Terminals: CORE win ±(100000−turn) from toMove perspective; CAP/STALEMATE → comparison vector integrity×1000 + blades×300 + exposed×5 + outcome±1 (mirrors `decideCap`). Root `winning`/`unsafe` reuse legacy helpers. Wire tiers.
- [ ] **Step 4:** Run → RED 21 GREEN, suite PASS. Record.
- [ ] **Step 5: RED 22 determinism** — seeds 0..14: repeated `chooseAction(s,tier)` agree; rebuilt `createGame(seed)` agrees; `aiExplain(s,tier).chosen === actionKey(choice)`; both search tiers. (Written in step 1, failed on the stub; GREEN step 3 satisfies it.)
- [ ] **Step 6: RED 23 budgets** — `searchExplain(s,{depth:6,nodes:1})` returns legal chosen with depth 1 fallback, nodes ≤ 1… (fallback computes root statics: nodes counted as root children examined; assert `nodes <= budget` holds by construction — count root fallback evaluations within budget); normal tiers: `explained.nodes <= SEARCH_BUDGETS[tier].nodes`, `explained.depth <= max`, `scores.length === considered`, integer scores, chosen present; DONE state throws for all tiers + `searchExplain`; bad limits throw ({depth:1},{depth:13},{nodes:0},{nodes:200001}, non-integers).
- [ ] **Step 7: RED 24 legality sweep** — 10 seeds ARTISAN self-play + 6 seeds MASTER self-play: every chosen action `checkAction ok`, turn ≤ TURN_CAP. (Runtime-bounded; record actual counts.)
- [ ] **Step 8: RED 26 terminals** — constructed immediate-win choice prefers faster win: position with two core-capture lines of different length → chosen is the shorter; cap agreement: for capped self-play states, search's terminal comparison sign matches `decideCap` winner (assert via `searchExplain` scores on a manual capped state: outcome side scores higher).
- [ ] **Step 9:** Run full suite → PASS. Record REDs 22/23/24/26 + GREEN with real numbers.
- [ ] **Step 10:** Commit `feat: negamax search with iterative deepening and node budgets`.

### Task 3: MASTER evaluation + strength gate (RED 25)

**Files:** Modify `engine.mjs` (MASTER eval terms); Test `verify.mjs`.

- [ ] **Step 1: RED 25 tests** — tactical suite for all tiers: immediate core capture taken (existing manual position), handed-capture avoided, blade capture preferred over neutral fold (existing positions). MASTER eval presence: `searchExplain` on a core-threat position scores the threat-building move above a neutral fold (construct: blade one fold from enemy core contact, no immediate win). Strength sweep: 8 seeds, MASTER vs APPRENTICE alternating sides, full games; gate `masterWins > apprenticeWins` (draws counted separately, recorded).
- [ ] **Step 2:** Run → MASTER-eval test FAILS (base eval misses threat); sweep may fail. Record RED 25.
- [ ] **Step 3: GREEN** — MASTER leaf eval = base + own blades contacting enemy core ×40 − enemy blades contacting own core ×35 + own legal strikes ×6 − enemy legal strikes ×5 (integer, ACTIVE states only). Re-run sweep; if gate fails, tune weights (document each change) until it passes — never weaken the assertion.
- [ ] **Step 4:** Full suite PASS; record sweep numbers (W/L/D per side) in TDD-EVIDENCE.md.
- [ ] **Step 5:** Commit `feat: MASTER threat/mobility evaluation + strength gate`.

### Task 4: UI wiring (RED 27 part 1)

**Files:** Modify `index.html`; Test `verify.mjs` static scans.

- [ ] **Step 1: RED 27 scans** — html contains `id="difficulty-fieldset"` + `<legend>Machine difficulty</legend>`; three radios `name="difficulty"` values APPRENTICE/ARTISAN/MASTER with labels; `DIFFICULTY_KEY` localStorage persistence with try/catch fallback; `scheduleAI` passes tier (`aiExplain(ui.state, ui.difficulty)` pattern); radios disabled in PASS mode; boot ai-note mentions all three tier names + node budgets; wiring scan list extended with `AI_TIERS`, `SEARCH_BUDGETS`.
- [ ] **Step 2:** Run → FAIL. Record RED 27.
- [ ] **Step 3: GREEN** — implement fieldset in Match setup grid; `ui.difficulty`; load/save with validation (unknown → APPRENTICE); mode-change handler toggles disabled; `scheduleAI` reads `ui.difficulty` at fire time; pendingNote reports tier + depth + nodes for search tiers, legacy text for APPRENTICE; boot sets radios + ai-note from `AI_TIERS`/`SEARCH_BUDGETS`.
- [ ] **Step 4:** Suite PASS. Record GREEN. Commit `feat: accessible difficulty selector wired to the search tiers`.

### Task 5: Honest documentation (RED 27 part 2)

**Files:** Modify `README.md` ("The machine opponent, honestly"), `index.html` help text if needed; Test `verify.mjs` README scans extended (tier names, 'node budget', 'deterministic').

- [ ] **Step 1:** RED — README scans for 'APPRENTICE', 'ARTISAN', 'MASTER', 'node budget' fail. Record.
- [ ] **Step 2:** GREEN — rewrite section: three tiers, what each sees, budgets, worst-case think time honesty, determinism per tier, default unchanged, share strings record actions not tiers. Keep all existing scanned phrases.
- [ ] **Step 3:** Suite PASS. Record. Commit `docs: honest three-tier machine documentation`.

### Task 6: Release verification + deploy + board

- [ ] Full `node verify.mjs` → record final totals (old 134 + new, all counters).
- [ ] Self-review diff against spec (superpowers:verification-before-completion): every spec item has a test or scan; no orphan exports; no secrets.
- [ ] Push `main`; verify remote SHA; fetch live Pages URL → difficulty fieldset + tier text present in served HTML.
- [ ] Second Brain: design note + shipped note (verified numbers, commit SHA, live URL), index update, commit + push + remote SHA verify.
- [ ] Final report in topic 675: tiers, evidence, gates, honest limits.
