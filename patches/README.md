# Unpublished game changes

The `@masonf539/egyptian-war@1.0.1-beta.6` patch adds room scoreboard metadata,
slap explanations/stat reporting, offline countdowns, live host controls,
eight-player support, flat-edge seating for the rectangular table, stable pile
layout and activity scrolling, compact landscape presentation, panel-tool
clearance, safe handling of replies after leaving a game, and preservation of
running turn deadlines when a player removal is rejected, and fresh turn timers
when a departure awards the pile. Recovery messages also respect an early host
resume while other players remain offline. Unmounting also clears unsent chat
drafts so they cannot carry into an unrelated room. Turn announcements update
only when their wording changes, avoiding redundant live-region mutations.
It updates only runtime engine/session/definition JavaScript and browser files.
The independent Egyptian War repository remains the source of these changes.

Normal `npm install` and `npm ci` commands apply the patch through the install
hook, including both Docker stages. Patch failures stop installation. Remove
this patch when adopting a published game version containing these changes.


The package copy under `node_modules/@masonf539/egyptian-war` is what GameHub
runs. Edit the independent `Egyptian-War` repository first, then refresh that
installed copy and regenerate this patch. Editing the source checkout alone
does not update the normal GameHub build.

The compact layout still has an accepted limit: eight seats plus several
disconnect labels can crowd the central pile on extremely short screens. See
`Egyptian-War/docs/implementation.md` in the collection for layout details.
