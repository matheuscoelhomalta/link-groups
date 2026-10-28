# Link Groups

Organize links into custom groups and open them all at once with keyboard shortcuts.

## Features

- **Create Link Groups**: Organize your frequently used links into named groups
- **Bulk Import**: Paste multiple URLs at once to quickly populate a group
- **Browser Selection**: Choose which browser to open links in (Chrome, Safari, Firefox, Arc, Edge, Brave, Opera, or system default)
- **Keyboard Shortcuts**: Create Raycast Quicklinks to open all links in a group with a single shortcut
- **Deeplink Support**: Generate deeplinks to trigger groups from other apps or scripts

## Usage

### Managing Groups

1. Open Raycast and search for "Link Groups"
2. Create a new group with `⌘ N`
3. Add links to your group manually or use bulk import
4. Open all links in a group with `⌘ O`

### Creating Keyboard Shortcuts

1. Select a group and press `⌘ ⇧ C` to copy the deeplink
2. Create a new Raycast Quicklink with the copied deeplink
3. Assign your preferred keyboard shortcut to the Quicklink

### Bulk Import

1. Open a group and press `⌘ ⇧ I`
2. Paste multiple URLs (one per line)
3. All valid URLs will be added to the group

## Commands

| Command | Description |
|---------|-------------|
| Link Groups | Main interface for managing groups and links |
| Open Link Group | Background command to open all links in a group (used via deeplinks) |

## Automatic Sync Between Macs

Link Groups can share its groups through an existing SSH/Tailscale connection to another Mac. No additional service or listening port is needed. The shared database is stored on the sync Mac at `~/Library/Application Support/Link Groups Sync/database.json`.

Configure each installation by creating `sync-config.json` in the extension's Raycast support directory (`~/Library/Application Support/com.raycast.macos/extensions/link-groups`):

- On the sync Mac, use `{}` to access the shared database directly.
- On another Mac, use `{"sshHost":"user@your-mac.your-tailnet.ts.net","tailscalePath":"/usr/local/bin/tailscale"}` with your own SSH destination and absolute Tailscale executable path. SSH must already work without an interactive password prompt for the same user running Raycast.

The extension fetches current groups when opened, refreshes every five seconds while its UI is open, and fetches again before each edit or deeplink launch. Initial setup preserves groups and links from both installations by their existing IDs; the sync Mac's existing fields take precedence if the same item was edited differently before setup. Existing group IDs and Quicklink targets stay intact.

Writes are locked, atomic and checked against a revision so concurrent edits do not silently overwrite each other. The previous shared database is kept in `database-backup.json`; each Mac also retains the extension's local backup. If the sync Mac is unavailable, cached groups remain readable and can still be opened, but edits fail until the connection returns. Raycast must be running on the sync Mac for its UI to refresh, but SSH access alone is sufficient for other Macs to use the shared database.

Without a sync configuration file, the extension continues using local storage. Raycast Cloud Sync can sync Quicklinks separately; it is not used to transport this shared group database.

`sync-status.json` in each installation's support directory records the last successful sync, revision, counts and database hash for verifying both Macs. It contains no group titles or URLs.

Each installation saves every successfully received revision as a private JSON file in its support directory's `backups` folder. The sync Mac also archives the previous shared revision before changing the database. These files can be restored through **Import Data → Link Groups Backup**; use merge to recover missing items or replace to restore the whole snapshot. Snapshots are retained without automatic deletion. This protects versions observed by the other Mac if the sync Mac's disk fails; changes never received by another Mac still depend on a separate machine backup.

Run `npm test` for the sync server and storage integration checks.
