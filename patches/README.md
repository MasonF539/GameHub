# Game package patches

No game patches are currently required. GameHub installs
`@masonf539/egyptian-war@1.0.1-beta.7` directly from npm, including its runtime,
generated TypeScript declarations, design notes, and implementation notes.
The obsolete beta.6 patch was removed when adopting that release.

For future unpublished game fixes, edit the independent game repository first,
refresh the installed package, and track a version-specific patch here. Normal
installation and both Docker stages run the patch hook; an empty patch directory
is a no-op. Patch failures stop installation instead of silently dropping fixes.
Remove an obsolete patch when adopting a release that includes its changes.

The package under `node_modules/@masonf539/egyptian-war` is what GameHub runs.
Editing the separate source checkout alone does not update the normal build.
