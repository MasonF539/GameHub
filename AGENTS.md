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
