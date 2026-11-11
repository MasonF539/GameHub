# Roulette optimization review

This is an ongoing review. Apply behavior-preserving changes with measurements
and regression checks. Leave changes to game pacing, visuals, network delivery,
or platform contracts for discussion.

## Applied during this review

- Reuse unchanged player seats, table chip stacks and the full bet list. Render
  keys include every field used by that view, including ownership, colors,
  balances for proportional stacks, and the compact-stack mode.
- Reuse unchanged bank-history and card-activity rows, and defer closed scoreboard rendering until it opens with the latest payload.
- Group public spot effects once per render, reuse the current viewer ID while sorting chip stacks, and resolve player targets through the existing seat index.
- Maintain a separate base label for each betting target so repeated card-effect
  announcements never accumulate in its accessible label.
- Index immutable card definitions for rule lookups; ownership, suppression and reversal remain evaluated from current player state.
- Build reservation totals once per server snapshot, preserving exclusions for
  free/forced bets. Action validation still uses the live ledger; no cross-request
  snapshot or permission cache is introduced.

In one 4x-CPU-throttled browser test with twelve players, sixty bets and a 24-card
hand, ten unchanged snapshots dropped from about 161ms to 23ms at desktop size,
and 113ms to 23ms at phone size. These figures do not represent physical-device
frame rates or public-tunnel latency.

## Proposals left for discussion

| Proposal | Potential benefit | Why it is not applied automatically |
| --- | --- | --- |
| Send card catalogue, bet spaces and wheel order once per match | Smaller messages and less repeated JSON parsing | Requires versioned synchronization, reconnect/full-state fallback and SDK/client compatibility checks. |
| Coalesce or debounce server broadcasts | Fewer updates during bursts of bets | Can delay target choices, card animations, affordability and other players' bets. |
| Enable WebSocket compression | Lower transfer sizes | Adds CPU/memory cost and requires load testing on the host and tunnel. |
| Simplify textures, shadows or the wheel animation by default | Lower paint/compositing cost | Changes the approved appearance or animation; keep existing graphics settings available. |
| Keep the timer animation running across snapshots with a correction threshold | Fewer animation restarts | Changes deadline-correction behavior and needs timing review around pauses and card animations. |
| Virtualize large receipt/hand lists | Fewer rendered nodes | Affects keyboard focus, screen-reader traversal, card inspection and scrolling. |
| Build the wheel during idle time instead of initial rendering | Shorter first-state setup | Needs a first-spin fallback and lifecycle cleanup; could move a visible delay into the spin. |
| Remove departed-player history sooner | Less long-match memory and settlement scanning | Could change outstanding bets, taxes, theft receipts or reconnect behavior. |
| Cache complete viewer snapshots across requests | Less server work | Risks stale permissions, timers or hidden-information leaks. |

A server-only baseline of 1,000 snapshots with twelve players and 300 paid bets
took roughly 82ms, excluding transport and client rendering. A snapshot in that
scenario serialized to about 100KB; twelve viewer-specific messages total roughly
1.2MB before any transport compression. Card ownership and real room activity
can change those measurements substantially.

The per-snapshot reservation pass reduced the same 1,000-snapshot server
measurement from about 82ms to 55ms, with unchanged serialized payload size.

Changing-wager updates also retain unaffected spots and seats. Ten one-wager
updates in the same browser scenario fell from about 126ms to 53ms at desktop
size and 120ms to 50ms at phone size. Keyboard target focus and seat ordering
are covered by regression tests.

After the definition index, the server baseline measured about 29ms per 1,000
snapshots, still about 100KB per snapshot. Eight deterministic twelve-player
matches (11,247 actions and 19,296 viewer snapshots) matched the pre-optimization
server after normalizing opaque IDs. All 383 game tests pass at this checkpoint.

A twenty-cycle mobile mount/shop/panel/unmount browser check found no retained
listeners, intervals, observers or input subscriptions and no growing DOM count.


## Public-card target reconciliation follow-up (2026-11-11)

Repeated snapshots retain still-authorized highlights and unchanged spotlight
cutouts. Permissions still refresh for pending requests, pause/animation state,
and changed options, including changes within the same prompt ID. Every call
remeasures geometry; resize callbacks also reposition cutouts. This avoids a
position cache that could drift after the layout changes.

In the same four-times-CPU-throttled browser with every betting spot eligible,
ten unchanged target-choice snapshots fell from roughly 331ms to 38ms at phone
size and 1,099ms to 838ms at desktop size. Initial opening remains expensive;
these measurements establish an update-path improvement, not physical-phone
frame rates or a guarantee that target selection has no remaining cost.


The target follow-up passed all 384 game tests and the fresh-consumer/live shop
checks before being pushed. A further two long deterministic matches accumulated
44-46 distinct owned stacks (81-104 copies); 5,927 actions and 5,052 viewer
snapshots still matched the baseline after opaque ID normalization. At those
endpoints, 1,000 server snapshots took roughly 84-117ms. This does not establish
a need for cross-request permission/state caches; server processing remains small
compared with the measured client rendering costs.

A possible follow-up is scheduling spotlight geometry reads after the complete
render instead of synchronously. Leave that for review: it could briefly display
old cutouts or delay targeting after a phase/layout change. Do not silently
change target visibility or input timing to improve benchmark numbers.
