# Testing changes to packaged games

When changing a game that GameHub already installs from npm, integrate the
unpublished changes into the current GameHub branch before handing them back
for testing. Normal installation, build, and start commands must use the changes;
a separate checkout or an environment-variable preview alone is insufficient.

Keep the game's independent repository as the source of the change. Until a new
package version is published, track a version-specific `patch-package` patch in
`patches/` and verify it applies to a fresh installation. Include patches in both
Docker installation stages. Patch only files needed by the running package.
When adopting a published version containing the fix, remove its obsolete patch.
Do not publish packages just to enable local testing unless the user asks.


# Settings controls

Use a sliding On/Off switch by default for boolean settings, including new
general settings and game-rule settings. Reuse the `.settings-switch` markup
and styles: a native checkbox with `role="switch"`, an associated label, and
the `.settings-switch-state` visual On/Off indicator. Preserve native keyboard
behavior, disabled permissions, and existing save/preset handling. Numeric
sliders, dropdowns, and action buttons keep their appropriate control types.


# Function documentation

Add JSDoc (`/** ... */`) immediately before named functions, methods, accessors,
and named function-valued helpers so editor hover shows their purpose. Describe
the actual behavior; include parameter, return-value, and thrown-error details
when they clarify the contract. Keep existing descriptions accurate when code
changes. Anonymous inline callbacks do not need boilerplate descriptions.

JSDoc-only edits may remain source-only: do not publish packages, change package
versions, rebuild package artifacts, or generate install patches solely to ship
these comments.
