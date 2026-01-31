# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Raycast extension called "Link Groups" that allows users to organize links into custom groups and open them all at once with keyboard shortcuts. It's a macOS-only productivity tool built with the Raycast API.

## Commands

### Development
- `npm run dev` - Start Raycast development mode (runs `ray develop`)
- `npm run lint` - Run ESLint checks (runs `ray lint`)
- `npm run fix-lint` - Auto-fix linting issues (runs `ray lint --fix`)
- `npm run build` - Build the extension (runs `ray build`)
- `npm run publish` - Publish to Raycast Store (runs `npx @raycast/api@latest publish`)

### Testing
This extension does not have a test suite. Testing is done manually through Raycast's development mode.

## Architecture

### Command Structure

The extension exposes two Raycast commands defined in package.json:

1. **link-groups** (view mode) - Main UI for managing groups and links
2. **open-link-group** (no-view mode) - Background command that opens all links in a group by ID (used for keyboard shortcuts via deeplinks)

### Data Flow

**Storage Layer** (`src/lib/storage.ts`):
- All data is persisted in Raycast's LocalStorage under the key `link-groups-db`
- `useLinkDB()` hook - For React components (view commands). Provides reactive state with `isLoading` indicator
- `readDB()` / `writeDB()` functions - For no-view commands. Direct async read/write without reactive state
- Data structure: `LinkDB` with version field and array of `LinkGroup` objects
- Safe parsing with fallback to DEFAULT_DB if corrupted

**Component Hierarchy**:
```
link-groups.tsx (main command)
├── LinkGroupsCommand - List view of all groups
│   ├── AddGroupForm - Create new group
│   └── ChangeBrowserForm - Change group's default browser
│
group-links.tsx (pushed from LinkGroupsCommand)
├── GroupLinks - List view of links within a group
│   ├── AddLinkForm - Add link to group
│   └── BulkImportForm - Bulk import URLs
│
open-link-group.ts (no-view command)
└── OpenLinkGroupCommand - Opens all links in a group (triggered via deeplink)
```

### Key Patterns

**State Management**:
- No global state library (Redux, Zustand, etc.)
- All state managed through `useLinkDB()` hook which wraps Raycast's `useLocalStorage`
- UI commands call into `useLinkGroupActions()` in `src/hooks/useLinkGroupActions.ts` to keep business logic out of components
- Updates are immutable - map over arrays to create new objects rather than mutating

**ID Generation**:
- Both groups and links use `randomUUID()` from Node's `crypto` module
- IDs are stored as strings

**Browser Selection**:
- Browser is specified via macOS bundle identifier (e.g., `com.google.Chrome`)
- Empty string `""` means system default browser
- Browser options defined in `src/lib/types.ts` as `BROWSER_OPTIONS` array
- Each group can have its own default browser
- `getBrowserLabel()` in `src/lib/types.ts` resolves the display label for a bundle ID

**Opening Links**:
- `openAllUrls()` function in `src/lib/openAll.ts` handles opening multiple URLs
- Uses `Promise.allSettled()` to open all links simultaneously
- Shows toast notification with success/failure count
- Respects the group's browser preference via Raycast's `open()` API

**URL Utilities**:
- `src/lib/url-utils.ts` provides URL normalization, bulk parsing, and title generation for imports

**Deeplinks**:
- Groups can generate deeplinks using `createDeeplink()` from `@raycast/utils`
- Deeplinks point to the `open-link-group` command with `groupId` argument
- Users can create Raycast Quicklinks (keyboard shortcuts) to instantly open all links in a group

## Type System

All types are defined in `src/lib/types.ts`:
- `LinkItem` - Individual link with id, title, url
- `Browser` - Union type of supported browser bundle IDs
- `LinkGroup` - Group with id, title, links array, optional browser
- `LinkDB` - Root data structure with version and groups array

## Important Notes

- This extension uses TypeScript with strict mode enabled
- Module system is NodeNext (ESM)
- JSX runtime is automatic (react-jsx)
- All browser bundle IDs must match macOS application bundle identifiers
- The data structure includes a `version` field to support future migrations
