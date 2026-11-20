# ORIGAMI//WAR — Deeper Machine AI (Design)

- Date: 2026-11-20
- Status: concept approved by Abel (iteration 2 picked in DM, 2026-11-20); design
  decisions delegated to Blank ("please do it there", topic 675). Every choice below
  that Abel did not make personally is marked **[Blank's call]** and is reversible.
- Routing: work happens in 『 DISBOARD 』 topic ORIGAMI//WAR (thread 675).

## Intent

The shipped machine is an honest bounded two-ply heuristic: it sees one opponent
reply, enough to notice immediate core captures, and explicitly cannot plan
combinations. This iteration gives it real combination-planning search and three
difficulty tiers, without touching the rules, the OW1 share format, or the
determinism contract.

## Goals

1. A search-based machine that can plan multi-move combinations (fold to create a
   threat, then strike next turn even when the opponent replies in between).
2. Three selectable difficulty tiers; the default reproduces today's machine
   exactly, so all 134 existing tests and every recorded share string stay valid.
3. Determinism: same position + tier → same action, always. No wall-clock, no
   ambient randomness, count-based budgets only.
4. Mobile-first bounded work: declared node budgets, honest worst-case think time.
5. Accessible UI: labelled radio group, persisted choice, screen-reader friendly
   decision notes.

## Non-goals

- No rules changes (folds, strikes, tokens, cap, termination all untouched).
- No OW1 format change; tier is not part of share strings (a string records what
  was played, not who chose it — replay stays exact).
- No perfect-play claim. Bounded search is strong, not omniscient; MASTER stays
  human-beatable. **[Blank's call]** — Abel was asked "perfect or beatable" and
  delegated; beatable-by-construction is the honest default for a bounded search.
- No network, no dependencies, no personal data.

## Anti-goals

- A "deep" tier that is secretly the old heuristic with a new label.
- Strength claims not backed by a test sweep.
- UI that blocks indefinitely: every search is node-bounded.

## Constraints

- `engine.mjs` stays pure and DOM-free; `commitAction` remains the only rules
  transition used by search (no parallel fast-path rules that could diverge).
- All 134 existing tests stay green, unmodified in their assertions.
- `verify.mjs` static scans (UI controls, engine wiring, README, orphan exports)
  must pass with the new surface.
- Measured on this host: `commitAction` ≈ 0.1–0.2 ms; naive depth-4 ≈ 284 ms;
  alpha-beta depth-6 ≈ 2–3.3k nodes / 450–740 ms with double-commit ordering.
  Production ordering caches child states (one commit per child), roughly halving
  that. Low-end mobile may be 2–4× slower.

## Approaches considered

1. **Deeper greedy rollouts (N-ply static scoring).** Cheap, but still no
   adversarial planning: it would miss opponent resources between our moves.
   Rejected — does not meet the mission.
2. **Beam search over the fold graph.** Bounded width, but beams drop tactical
   lines (quiet folds that set up captures) unpredictably, and strength is hard to
   state honestly. Rejected.
3. **Negamax + alpha-beta, iterative deepening, fixed node budget.** Classic,
   deterministic under canonical ordering, finds forced combinations, degrades
   gracefully to the last completed depth when the budget runs out. Spike-verified
   feasible (depth 6 within a few thousand nodes). **Chosen.**

## The tiers **[Blank's call]**

| Tier | Search | Max depth | Node budget | Evaluation |
|---|---|---|---|---|
| `APPRENTICE` (default) | existing two-ply heuristic, byte-identical | 2 | n/a (existing limits) | existing `scoreAfter` |
| `ARTISAN` | negamax α-β, iterative deepening 2→4 | 4 | 2 500 | base weights |
| `MASTER` | negamax α-β, iterative deepening 2→6 | 6 | 6 000 | base + threat/mobility terms |

- Budgets count **nodes across all iterations**; exhaustion mid-depth keeps the
  best move of the last *completed* depth. Deterministic, count-based, never timed.
- Worst-case think time ≈ budget × per-node cost: ARTISAN ≤ ~0.3 s, MASTER ≤ ~0.7 s
  on this host; up to ~2 s on low-end mobile. Documented honestly in UI/README.
  Pause cancels a pending turn before search starts; a started search is bounded
  and completes.

## Search specification

- Root: `legalActions(state)` (canonical order), capped at `AI_ACTION_LIMIT`.
- Move ordering at every node: child static score descending, then canonical
  action key ascending; child states computed once and cached for recursion.
- Iterative deepening from depth 2; previous iteration's best move ordered first
  at the root. Keep the best move of the last completed depth.
- Leaf evaluation: integer, side-to-move relative.
  - Base (both search tiers): the existing `scoreAfter` weights (core damage
    +1000/−900, blades +300/−250, contact +12/−10, exposed +5, tokens +7).
  - MASTER additions: own live blades in contact with enemy core +40 each; enemy
    live blades in contact with own core −35 each; legal strike count +6/−5
    (mobility/tempo). All integer. **[Blank's call]**
- Terminal scores: core win ±(100 000 − turn) — prefer faster wins, delay losses.
  CAP/STALEMATE terminals score the exact `decideCap` comparison vector
  (integrity ×1000, blades ×300, exposed ×5, initiative ±1), so search's cap
  judgments agree with the rules.
- Ties at the root: lexicographically smallest action key (existing convention).
- Immediate core capture and avoiding handed captures remain emergent properties
  of the search (depth ≥ 2 sees both); no special-case filters in search tiers.

## API surface (additions only)

- `AI_TIERS` — frozen `['APPRENTICE', 'ARTISAN', 'MASTER']`.
- `SEARCH_BUDGETS` — frozen `{ ARTISAN: {depth: 4, nodes: 2500}, MASTER: {depth: 6, nodes: 6000} }`.
- `chooseAction(state, tier = 'APPRENTICE')` — extended; default path unchanged.
- `aiExplain(state, tier = 'APPRENTICE')` — extended:
  - APPRENTICE: exact existing shape `{side, depth: 2, considered, winning, unsafe, scores, chosen}`.
  - Search tiers: `{side, tier, depth: <completed depth>, nodes, budget, considered, winning, unsafe, scores, chosen}`
    where `scores` are root search scores (integers), `winning`/`unsafe` keep their
    meaning (immediate core win / hands immediate core capture).
- Unknown tier throws; finished match throws (existing contract).

## Interface

- New fieldset **Machine difficulty** in Match setup: three labelled radios,
  APPRENTICE checked by default; disabled while PASS mode is selected (it only
  affects solo). **[Blank's call]**
- Choice persisted at `localStorage['origami-war/difficulty/v1']`; applies from
  the next machine turn, no restart needed; invalid stored values fall back to
  APPRENTICE.
- `scheduleAI()` passes the tier to `aiExplain`/`chooseAction`; the decision note
  reports tier, completed depth and nodes searched.
- Help dialog `ai-note`, README "The machine opponent, honestly", and the situation
  line's machine description rewritten to describe all three tiers truthfully.
- `matchRecord`/history schema unchanged; share strings unchanged.

## TDD slices (RED-first, appended to TDD-EVIDENCE.md)

- RED 20 — tier registry: `AI_TIERS`, `SEARCH_BUDGETS` shape; unknown tier throws;
  default tier is APPRENTICE and byte-identical to today's choice.
- RED 21 — combination planning: constructed position with a forced 3-ply core
  win that APPRENTICE misses; ARTISAN/MASTER find a move after which every
  opponent reply still allows an immediate core capture.
- RED 22 — determinism: repeated calls and rebuilt states agree per tier across
  seeds; no clock/random dependence.
- RED 23 — budgets: `nodes ≤ budget`, `depth ≤ tier max`, exhaustion fallback is
  deterministic; finished match throws for every tier.
- RED 24 — legality sweep: search tiers never propose illegal actions across a
  bounded seed sweep; turn cap respected.
- RED 25 — strength gate: tactical suite (immediate win, avoid handed win, blade
  capture) passes for all tiers; MASTER-vs-APPRENTICE alternating-sides seed sweep
  must show MASTER aggregate wins > losses. If empirically false, tune evaluation
  and re-run before release — never weaken the claim silently.
- RED 26 — terminal semantics: faster core win preferred; cap evaluation agrees
  with `decideCap`.
- RED 27 — UI/README scans: difficulty fieldset + labels, tier persistence,
  `scheduleAI` tier wiring, honest tier text, orphan-export scan green.

## Release gates

1. `node verify.mjs` → all old + new tests PASS, static scans green.
2. Strength sweep gate (RED 25) passes with real numbers recorded.
3. Commit + push `main`; GitHub Pages serves the new build; live fetch verifies
  the difficulty control and tier text are present.
4. Second Brain design + shipped notes pushed, remote SHA verified.

## Builder check

Self-review pass (Abel opted out of the question loop; no separate reviewer
round). Findings folded in: child-state caching for per-node cost; count-based
budgets for determinism; default-tier byte-identity to protect the 134-test gate
and share-string replay; PASS-mode disable to avoid a meaningless control.
