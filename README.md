# Voxel Fun

`voxel-fun` is a first-person voxel sandbox built with SvelteKit, TypeScript, and Three.js.
It is set up as a fast local building playground with mixed-size voxel blocks, in-editor tools,
and a dev-only world save flow that survives refreshes.

## What It Does

- Walk a small seeded voxel world in first person.
- Toggle into edit mode and add, remove, paint, or box-edit blocks.
- Place cubic voxel blocks at dynamic sizes from `1` to `8`.
- Use `4` as the baseline build size, with `1-3` smaller and `5-8` larger.
- Sample an existing block's material and size with middle mouse.
- Undo the last committed edit with `Ctrl+Z`.
- Persist your world locally during development and export/import JSON snapshots.

## Current Highlights

- Mixed-size voxel blocks are stored as block instances, not just single filled cells.
- Small voxel sizes can be placed side by side on larger surfaces without forced gaps.
- The base voxel world scale is smaller than the original prototype:
  `1` voxel cell is `0.25` world meters.
- The scene includes a tuned lighting pass with fog, tone mapping, and shadowed sunlight.
- The HUD is game-style rather than debug-first, while still exposing a field readout panel.

## Controls

Click the viewport to capture the mouse. Press `Tab` or `F1` to toggle edit mode.

### Movement

- `W A S D`: move
- `Shift`: sprint
- `Space`: jump

### Build Tools

- `Q`: brush add
- `E`: brush remove
- `R`: brush paint
- `Y`: face extrude
- `B`: box fill
- `H`: box hollow
- `C`: box carve
- `Shift + drag`: region drag with the active brush tool

### Build Selection

- Mouse wheel: change voxel size
- `-` / `=`: step voxel size
- `1-9`: select material
- Middle mouse: pick the looked-at block's material and size
- `Ctrl+Z`: undo the last committed edit

## Size Model

The editor uses a discrete size ladder:

- `1-3`: smaller than the default build scale
- `4`: default baseline size
- `5-8`: larger build steps

All blocks are cubic. A larger placed voxel occupies `size x size x size` internal grid cells.

## Dev Save Flow

In development mode, the world can persist between refreshes.

- Edits autosave locally after changes.
- The top-right dev panel exposes `Save`, `Reset`, `Export`, and `Import`.
- `Save` writes the current world to local browser storage.
- `Reset` restores the seeded starter world and overwrites the local save.
- `Export` downloads the world as a JSON snapshot.
- `Import` loads a previously exported JSON snapshot.

Notes:

- Local persistence is intended for development only.
- Undo is in-memory for the current session and is separate from exported snapshots.

## Getting Started

### Requirements

- Node.js 20+
- `pnpm`

### Install

```sh
pnpm install
```

### Run The App

```sh
pnpm dev
```

Then open the local Vite URL in your browser.

### Useful Scripts

```sh
pnpm dev
pnpm check
pnpm lint
pnpm build
pnpm preview
```

## Project Structure

```text
src/
  App.svelte              App shell and HUD
  lib/
    engine/              Game bootstrap, renderer, scene, input loop
    editor/              Edit tools, targets, controller, interaction state
    player/              First-person movement and collision
    voxel/               World data, meshing, commands, persistence, palette
    debug/               Field readout HUD
```

## Technical Notes

- Rendering uses Three.js with chunked voxel meshes.
- The world stores placed blocks with `origin`, `size`, and `materialId`.
- Chunk meshes are rebuilt only for dirty chunks after edits.
- World snapshots serialize from block data rather than raw dense voxel arrays.

## Known Limitations

- Undo currently supports only the last sequence of edits in the current session history and
  does not provide redo.
- Carve and paint operations affect whole touched blocks; they do not split large blocks into
  smaller fragments.
- Import/export is browser-driven and intended for local development workflows.

## Stack

- SvelteKit
- Svelte 5
- TypeScript
- Three.js
- Vite
- ESLint
- Prettier
