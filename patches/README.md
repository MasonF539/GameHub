# Unpublished game changes

`npm install` and `npm ci` apply the patches here through `patch-package`.
The normal GameHub build and start commands therefore include game changes
being tested on this branch, without a preview environment variable.
Both Docker installation stages apply these patches too.

The Egyptian War `1.0.1-beta.5` patch adds the adaptive oval/rounded rectangular
table and player placement. It changes only the package's browser JavaScript
and CSS. The source changes are maintained in the independent Egyptian War
repository; remove this patch when GameHub adopts a published package that
contains them. Patch failures stop installation instead of silently serving
the old game.
