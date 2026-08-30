# ORIGAMI//WAR

A deterministic two-player duel fought on a folding sheet of paper. Vermilion and
Indigo each hold one **core** and three **blades**, pinned to fixed cells of a
5×5 sheet. Nobody moves. The only way to reach the enemy is to **fold the paper**
until distant cells lie next to each other — or on top of each other — and then
strike.

Dependency-free, offline, and small enough to read: one page, one engine module,
one test file.

- `index.html` — the whole interface (markup, CSS, and an ES module script)
- `engine.mjs` — the pure DOM-free rules engine
- `verify.mjs` — the Node test suite and static release scans
- `TDD-EVIDENCE.md` — the RED-first evidence trail for each behaviour slice

---

## Play

Open `index.html` from any static HTTP server, or publish the repository with
GitHub Pages (see below). Because the page uses an ES module, browsers will not
let it `import` the engine over the `file://` protocol — serve it over HTTP.

Any static server works, for example:

```
python3 -m http.server 8000
```

then open `http://localhost:8000/`.

---

## Rules

### The sheet

The paper is a 5×5 grid of **25 immutable paper cells**, each identified by its
original paper coordinate. Rendered position is separate: every paper cell has

- integer **screen coordinates** (which stack it currently lies in),
- a **face** (front or back — folding turns cells over),
- an exact **bottom-to-top layer rank** that is globally unambiguous.

At the start the sheet is flat: 25 stacks of one layer, all front-up.

### Folding

A fold is an axis (`x` or `y`), an integer **crease**, and a direction
(`low` or `high`). Crease `c` is the line between band `c-1` and band `c`.
The flap is everything on the chosen side of the crease. A fold is legal only if

1. the crease lies strictly inside the occupied band on that axis,
2. the flap is non-empty,
3. reflecting the flap lands it **entirely inside the stationary bounding box**,
4. at least one destination square **covers a stationary stack**.

Committing a legal fold:

- reflects the flap's coordinates across the crease,
- **reverses** the bottom-to-top order of every moving stack,
- **toggles the face** of every moved cell,
- places the reversed flap **above** every stationary layer, in an exact global
  order with no ties.

Illegal folds are rejected outright and change nothing.

On the flat sheet exactly eight folds are legal (four per axis), because a flap
that would overhang the rest of the sheet is not allowed.

### Contact and strikes

Contact — and only contact — is the consequence of overlap. Two paper cells are
in contact when they are

- **in the same stack**, or
- **in stacks at orthogonally adjacent screen coordinates**.

Diagonals are not contact. A live unit may **strike** a live enemy it is in
contact with. A blade strike **captures** the blade. A core strike removes **one
integrity**; a core reduced to **integrity 0** is captured and the match ends
immediately in favour of its captor.

There is no movement system. Units never leave their paper cell; the paper moves
underneath them.

### Turns, budget and ending

- Each turn commits **exactly one** legal fold or strike.
- Each side has **3 fold tokens**; every fold spends one. Strikes are free.
- The match is capped at **24 committed actions** in total.
- Capturing a core wins immediately.
- If the side to move has **no legal action at all**, the match ends there and is
  scored the same way as the cap.

At the cap, the winner is decided in this order:

1. higher surviving **core integrity**,
2. more surviving **blades**,
3. more **controlled exposed top faces** (the owner of the top live unit in each
   stack),
4. the **seeded initiative**, which belongs to the side that *opened*.

A draw is defined in the vocabulary but the initiative always breaks a full tie,
so a draw only appears for a hand-built position that carries no initiative.

Turn-one wins are impossible: the seeded deployment leaves two clear rows
between the armies, so no strike exists before anyone has folded, and a core
needs two hits.

### Seeded deployment

A seed (any integer from 0 to 4294967295) drives a small integer PRNG inside the
pure core. Vermilion deploys in paper rows 0–1 with its core on row 0; Indigo is
the exact 180° rotation of that deployment. That guarantees distinct placements,
mirrored fairness, and no initial contact. Every seeded start is validated before
it is handed to the interface.

The seed also fixes which side opens. The opener holds the tie-break initiative,
which compensates it: it has to act on a flat sheet where no strike exists yet,
and the other side takes the final action at the cap.

---

## Controls

| Action | How |
| --- | --- |
| Choose an action | The **Your action** list: one button per legal fold or strike |
| Preview a fold | Focus or hover its button — no commitment |
| Commit | Activate the button (click, tap, Enter or Space) |
| Undo | The **Undo** button, while your action is still unanswered |
| Read a square | Activate it on the board; its full stack is read into the situation line |
| Pause / help | The **Pause** and **Rules & help** buttons; `?` also opens help; `Esc` closes dialogs |
| New match | **Match setup**: seed, mode, **Start new game** |
| Same seed again | **Replay same seed** |

Every fold button shows, before you commit: the selected flap, where it lands,
which way it travels, the resulting layering bottom-to-top, and the exact strike
contacts the fold would create for either side.

### Undo

**Undo** is offered only while a committed action is still unanswered — in solo
before the machine replies, and in pass-and-play before you hand the device over.
It reverts the **whole** action, restoring the exact prior topology and unit
state, and it is then disarmed. There is no fold/unfold loop to farm: in a real
match the topology only ever changes through committed folds.

---

## Accessibility

- Mobile-first and genuinely playable at 320 px wide; fluid type and layout, no
  horizontal scrolling, zoom-safe (no maximum-scale lock).
- Full keyboard operation with a visible focus ring; primary targets are at least
  44×44 px.
- Semantic HTML throughout: real `button`, `input`, `fieldset`/`legend`,
  `dialog`, landmarks, headings, and a `role="status"` live region.
- Nothing depends on colour alone: units carry a shape (◆ core, ▲ blade), a
  faction letter (V / I) and a full faction name in text.
- An **actionable text mirror** of the paper lists every stack bottom-to-top with
  layer faces, paper-cell identities and occupants; the action list is the same
  set of buttons a pointer user gets. Nothing is canvas-only.
- `prefers-reduced-motion` removes the fold hinge and cut-ins and resolves every
  action immediately. `prefers-contrast: more` and `forced-colors` are handled.
- Device pixel ratio, particles, shadows, history length and animation queues are
  all bounded — there is at most one pending animation and one pending machine
  reply at any moment.

---

## The deterministic model, honestly

This is **not physically accurate origami**. It is a discrete, integer topology
model: coordinates reflect exactly, layer ranks are integers with no ties, faces
are a single bit, and paper never stretches, curls or has thickness. Real paper
would resist most of what this model allows.

Everything in `engine.mjs` is a pure function of its inputs. It contains no
`Date`, no `performance`, no `Math.random`, no DOM, no storage, no network and no
wall clock — `verify.mjs` scans the shipped source to prove it. The same seed and
the same action log always rebuild a deep-equal match.

Every committed action appends a deeply frozen snapshot of the mutable game state
to the match history. That is what makes unfold exact rather than approximate:
LIFO unfold restores the recorded topology and unit state verbatim, so a
fold/unfold round trip is deep-equal by construction, not by re-deriving an
inverse transform.

## The machine opponent, honestly

Solo mode plays a **bounded two-ply heuristic, not a deep search**. It:

1. enumerates its own legal actions (hard-capped),
2. plays an immediate core capture if one exists,
3. discards actions that hand you an immediate core capture, when it can,
4. scores what remains on core damage, blade captures, contact potential,
   exposed control and fold-token conservation,
5. breaks ties on the lexicographically smallest canonical action key.

It looks exactly one opponent reply deep, only far enough to notice an immediate
core capture. It cannot plan combinations beyond that. It is fully deterministic:
the same position always yields the same legal action, which is why solo matches
replay exactly.

---

## Share / result strings

A completed match serialises to one compact validated line:

```
OW1-<seed base36>-<S|P>-<canonical actions>-<V|I|D>-<checksum base36>
```

- `OW1` — format version
- seed in lowercase base36
- `S` solo, `P` pass-and-play
- actions as concatenated canonical keys: folds are 4 characters
  (`F` axis crease `l`/`h`, e.g. `Fx1l`), strikes are 3 (`S` attacker target,
  e.g. `SCE`)
- outcome `V`, `I` or `D`
- an FNV-1a 32-bit **checksum** in base36

Validation is strict. A string is rejected if it is malformed, contains
whitespace or trailing garbage, fails the checksum, replays into an illegal or
unfinished match, disagrees with the stated outcome, or is merely non-canonical
(for example a zero-padded seed). Paste one into **Check a result string** to
validate it, or load it as a replay.

---

## Privacy and offline behaviour

- No network calls at runtime, and no external assets, fonts or CDNs.
- No accounts, no backend, no trackers, no telemetry of any kind.
- The only thing stored is a local match history in this browser's
  `localStorage`: seed, mode, outcome, reason, action count and result string.
  Newest first, capped at 20 matches, and clearable from the page. No personal
  data, no timestamps, no identifiers.
- The PNG export is generated in the page and downloaded locally; the canvas
  exists only for that export, and the interface itself stays semantic DOM.

---

## Tests

```
node verify.mjs
```

No dependencies, no build step, no flags. The suite exits `0` only when every
unit test, property sweep and static scan passes, and it prints machine-readable
totals followed by a single `RESULT: PASS`/`FAIL` line.

It covers, vertically: legal crease identification, coordinate reflection, layer
order and orientation, fold mutation, exact fold/unfold deep round-trips,
stack/orthogonal contact, strike legality and resolution, turn and fold budget
and termination, seeded legal setup, victory and tiebreak, deterministic AI
choice, replay equality, share-string validation and corruption rejection, and
bounded deterministic self-play.

The property sweeps assert, across many seeds and many legal fold sequences,
that all 25 paper cells appear exactly once in exactly one stack, that nothing is
lost or duplicated, that every fold unfolds back deep-equal, that identical
seed-and-log pairs are deep-equal, that the AI's action is always legal, and that
complete self-play always terminates inside the action cap.

`TDD-EVIDENCE.md` records the genuine failing run captured before each production
slice was written.

---

## GitHub Pages

The repository is already a suitable Pages site: static files only, no build
step, relative paths only, and `index.html` at the root. Enable Pages for the
default branch with the root folder and it will serve as-is over HTTPS. The
module import of `./engine.mjs` works because Pages serves `.mjs` as JavaScript.

---

## Licence

No licence is asserted here; add one before redistributing.
