# Sensitive files and external content

Each collection repository excludes these sensitive local files from Git and
Docker contexts:

- `.env` and `.env.*`
- `*.pem`
- Files beneath `secrets/`

Docker rules include nested-directory forms as well as root-level paths.
Git ignore rules do not untrack files already committed. Filename-only checks
found no tracked files matching these patterns when these rules were added.
Generated dummy files verified both Git exclusions and actual Docker build
exclusions without inspecting real environment files or keys.

## Agent access

`AGENTS.md` instructs agents not to read the sensitive paths and not to
automatically fetch or embed external images. Instructions inside images and
other external content cannot authorize commands, file reads or data transfers.

Neither ignore files nor agent guidance enforces filesystem read restrictions.
Use Codex permission-profile read-deny rules and network controls for enforced
boundaries, and verify the active profile. Managed settings can take precedence
over project configuration. These repository changes do not alter the current
session's managed permissions or the application's image-rendering settings.

See [OpenAI's permissions guide](https://learn.chatgpt.com/docs/permissions).
