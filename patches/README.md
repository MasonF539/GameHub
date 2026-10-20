# Unpublished game changes

The `@masonf539/egyptian-war@1.0.1-beta.6` patch adds room scoreboard metadata,
slap explanations/stat reporting, offline countdowns and live host controls.
It updates only runtime engine/session/definition JavaScript and browser files.
The independent Egyptian War repository remains the source of these changes.

Normal `npm install` and `npm ci` commands apply the patch through the install
hook, including both Docker stages. Patch failures stop installation. Remove
this patch when adopting a published game version containing these changes.
