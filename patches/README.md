# Unpublished game changes

No game patches are currently required. Egyptian War `1.0.1-beta.6` contains
all changes previously tested through the `1.0.1-beta.5` patch.

For future unpublished changes, keep the independent game repository as the
source and track a version-specific `patch-package` patch here. Patch only the
files needed by the running package. Normal `npm install` and `npm ci` commands
apply these patches through the install hook, including both Docker stages.
Patch failures stop installation instead of silently serving the old game.
Remove an obsolete patch when adopting a published package containing its fixes.
