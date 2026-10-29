# Game package patches

The `@masonf539+egyptian-war+1.0.1.patch` adds soft felt cross-hatching beneath
table content, respecting Simple table detail. GameHub installs
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
