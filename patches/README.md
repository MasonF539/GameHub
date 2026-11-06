# Game package patches

The `@masonf539+egyptian-war+1.0.1.patch` adds soft felt cross-hatching beneath
table content, respecting Simple table detail, and renames its music asset to
`background-music.mp3` with the matching registration path. GameHub installs
`@masonf539/egyptian-war@1.0.1` directly from npm, including the continuous timer,
personal graphics options, generated TypeScript declarations, and game docs.
The temporary beta.7 patch was removed when adopting the stable release.

For future unpublished game fixes, edit the independent game repository first,
refresh the installed package, and track a version-specific patch here. Normal
installation and both Docker stages run the patch hook; an empty patch directory
is a no-op. Patch failures stop installation instead of silently dropping fixes.
Remove an obsolete patch when adopting a release that includes its changes.

The package under `node_modules/@masonf539/egyptian-war` is what GameHub runs.
Editing the separate source checkout alone does not update the normal build.

The stable Egyptian War patch also opens the scoreboard as a native modal from
the panel button or general shortcut, keeping Chat and Spectators as the only
panel pages. Ping/status remains the rightmost column. Manual reset controls are removed;
GameHub starts fresh scoreboard totals automatically for each new match.

Keep surrounding context in generated diffs. Context-free insertion hunks can be
applied at incorrect scopes by patch-package despite reporting success. The
package-consumer verifier executes installed classic clients against their own
markup and checks registration, catching these runtime failures.
