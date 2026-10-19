# Unpublished game changes

`npm install` and `npm ci` apply the patches here through `patch-package`.
The normal GameHub build and start commands therefore include game changes
being tested on this branch, without a preview environment variable.
Both Docker installation stages apply these patches too.

The Egyptian War `1.0.1-beta.5` patch adds adaptive tables, keyboard hints,
personal display options and preview assets, and offline auto-play settings.
It also keeps central content clear of player seats, reuses seat elements during
state updates, and preserves a running turn timer when offline takeover begins.
Long challenge/activity text scrolls within the table on tight screens so cards
stay readable. Winners retain their identity when reconnecting during the victory animation.
It changes browser assets and the compiled game definition/session needed at
runtime. The TypeScript source and tests are maintained in the independent Egyptian War
repository; remove this patch when GameHub adopts a published package that
contains them. Patch failures stop installation instead of silently serving
the old game.
