# Engine AGENTS.md

Pure TypeScript simulation engine. Zero React imports, zero DOM dependencies (except `renderer.ts`). This is the hot path — every function here runs 30,000 times per frame.

## File Responsibilities

| File | Purpose | Hot path? |
|---|---|---|
| `types.ts` | `ParticleType` const enum, 9 property lookup tables, color tables | Read-only lookups |
| `grid.ts` | `Grid` class — flat typed array storage + chunk-based sleep/wake | Yes — every cell access |
| `particles.ts` | Per-type update functions + `UPDATE_FN` dispatch table | Yes — core simulation |
| `simulation.ts` | `Simulation` orchestrator — step loop, paint/erase/clear | Yes — drives frame |
| `renderer.ts` | `Renderer` — ImageData pixel writer (only file touching DOM) | Yes — every frame |

## Grid Memory Layout

Grid stores 4 parallel flat arrays indexed by `y * width + x`:

- **`cells`** (`Uint8Array`) — `ParticleType` value per cell (0–24). One byte each.
- **`moved`** (`Uint8Array`) — boolean flag, prevents double-updates within a single frame step.
- **`lifetime`** (`Uint16Array`) — frame counter per cell. Used for timed behaviors (Fire, Smoke, Steam, Ember).
- **`colorVariant`** (`Uint8Array`) — random 0–2 index assigned at creation for visual variety.

Grid also stores 2 chunk-level arrays indexed by `cy * chunksX + cx`:

- **`dirtyChunks`** (`Uint8Array`) — written during the frame by mutation methods. A chunk is marked dirty when any cell inside it changes.
- **`activeChunks`** (`Uint8Array`) — read during the frame by the simulation loop. Built from `dirtyChunks` at frame start via `buildActiveChunks()`.

**Critical invariant**: `cells[i]` and `colorVariant[i]` must stay in sync. When a particle transforms (e.g., Water→Steam), use `grid.setKeepVariant()` to preserve the color variant index, not `grid.set()` which randomizes it.

**Critical invariant**: All cell mutations MUST go through `Grid` methods (`set`, `setKeepVariant`, `swap`, `moveTo`, `incrementLifetime`) which automatically call `markChunkDirtyXY()`. Direct writes to `grid.cells[]` without marking dirty will cause the chunk to sleep and the change to go unsimulated.

## Chunk-Based Sleep/Wake

The grid is divided into 8×8 chunks (`CHUNK_SIZE = 8`, `CHUNK_SHIFT = 3`). Both constants are exported from `grid.ts`.

### How It Works

1. **Dirty marking**: Every `Grid` mutation method (`set`, `setKeepVariant`, `swap`, `moveTo`, `incrementLifetime`) calls `markChunkDirtyXY(x, y)`, which sets `dirtyChunks[cy * chunksX + cx] = 1` using bit-shift indexing (`y >> CHUNK_SHIFT`).
2. **Active expansion**: At frame start, `buildActiveChunks()` expands the dirty set by 1 chunk in all directions (8-connected neighbors). This ensures boundary interactions are simulated — e.g., sand at the bottom edge of a dirty chunk needs the chunk below it to also run. The dirty array is then cleared.
3. **Chunk-level skip**: The simulation loop iterates chunk-by-chunk. Inactive chunks (`activeChunks[idx] === 0`) are skipped entirely — zero cost per sleeping chunk.
4. **Inner loop**: Within active chunks, the loop uses direct `cells[]`/`moved[]` array access (no method call overhead) for maximum throughput.

### Performance Impact

- Settled regions (piles of sand, pools of water, static structures) cost **zero CPU** once they stop moving.
- Only actively changing regions and their immediate neighbors are simulated.
- `grid.activeCount` tracks how many chunks are active each frame (exposed in debug overlay).

### Gotchas

- **Infinite-lifetime particles**: Particles with `MAX_LIFETIME = 0` (infinite) must NOT call `incrementLifetime()` — this marks chunks dirty every frame, keeping them awake forever. Mud uses a probabilistic throttle (`Math.random() >= 0.34`) instead.
- **Direct cell writes**: If you must write to `grid.cells[]` directly (e.g., `Simulation.erase()`), you MUST also call `grid.markChunkDirtyXY()` manually.
- **New particle types**: Update functions that modify cells must use `Grid` methods (not direct array writes) to ensure automatic dirty marking.

## Simulation Step Order

Each `Simulation.step()`:

1. `grid.clearMoved()` — reset all moved flags.
2. `grid.buildActiveChunks()` — expand dirty chunks into active set, clear dirty.
3. Iterate **chunks** bottom-to-top, alternating L→R / R→L per frame.
4. Skip inactive chunks entirely (`activeChunks[idx] === 0`).
5. Within each active chunk, iterate cells bottom-to-top with alternating column sweep.
6. Skip cells that are `Empty` (type === 0), `moved`, or have no `UPDATE_FN` entry.
7. Call `UPDATE_FN[type](grid, x, y)` for each active cell.

The inner loop accesses `cells[]` and `moved[]` arrays directly (not via `grid.get()`/`grid.isMoved()`) to avoid method call overhead in the hot path.

**Why bottom-to-top**: Gravity-affected particles (sand, water, powders) fall downward. Processing from the bottom ensures a falling particle isn't processed again after it moves down.

**Why alternating sweep**: Without alternation, liquids/gases flow preferentially in one direction. Alternating L→R / R→L each frame produces symmetric spread.

## Particle Update Function Contract

```typescript
type UpdateFn = (grid: Grid, x: number, y: number) => void;
```

Every update function MUST:
- Only modify cells via `Grid` methods (`set`, `setKeepVariant`, `swap`, `moveTo`).
- Call `grid.markMoved()` on any cell it moves/creates to prevent double-processing.
- Never allocate objects (no `{}`, no `[]`, no `new`). Use local variables only.
- Never access DOM or React APIs.
- Use `grid.get(x, y)` for neighbor reads (returns `Stone` for out-of-bounds = wall behavior).

## Movement Patterns

Particles follow specific movement priority chains:

| Category | Movement order |
|---|---|
| **Powders** (Sand, Salt, Ember) | Down → Down-left/right (random order) |
| **Liquids** (Water, Lava, Acid, Mud, Mercury) | Down → Down-left/right → Left/right (random order) |
| **Gases** (Smoke, Steam, ToxicGas, Hydrogen) | Up → Up-left/right (random order) |
| **Static** (Stone, Wood, Metal, Plant, Fuse, Clone, Void, Glass) | Don't move. React in place. |
| **Fire** | Upward with randomness, lifetime-based |

Movement helpers: `tryMoveToEmpty()` moves into empty cells. `trySwapDisplace()` swaps with less-dense particles (uses `DENSITY` table). Liquids call both — first try empty, then try displacing lighter fluids.

## Renderer Pixel Format

`Renderer` writes pixels via a `Uint32Array` view over `ImageData.data`:

```
Pixel = 0xFF_BB_GG_RR  (ABGR byte order, little-endian)
```

The color lookup table `colorLUT` is a `Uint32Array[PARTICLE_COUNT * 3]` built at construction from `PARTICLE_COLORS`. Index: `type * 3 + colorVariant`. Each entry is a pre-packed ABGR uint32 — no per-pixel math needed.

## Property Tables (types.ts)

All 9 tables are indexed by `ParticleType` value. When adding a new particle, ALL must be updated:

| Table | Type | Purpose |
|---|---|---|
| `DENSITY` | `number[]` | Movement priority — heavier sinks, lighter rises |
| `IS_LIQUID` | `boolean[]` | Enables lateral flow |
| `IS_GAS` | `boolean[]` | Enables upward movement |
| `IS_FLAMMABLE` | `boolean[]` | Can be ignited by Fire/Lava/Ember/Metal |
| `IS_STATIC` | `boolean[]` | Never moves (Stone, Wood, Metal, etc.) |
| `MAX_LIFETIME` | `number[]` | Frame count before decay (0 = infinite) |
| `PARTICLE_COLORS` | `string[][]` | 3 hex color variants per type (visual variety) |
| `UI_COLORS` | `string[]` | Single hex color for toolbar button |
| `PARTICLE_NAMES` | `string[]` | Display name for toolbar |

## Interaction Patterns

Particle interactions use probability checks (`Math.random() < threshold`) to avoid deterministic behavior:

- **Transformation**: Cell changes type (Water + heat → Steam). Use `setKeepVariant()`.
- **Dissolution**: Both cells become Empty (Salt + Water). Use `set(x, y, ParticleType.Empty)`.
- **Explosion**: `explode(grid, cx, cy, radius)` clears a circle, spawns Fire at edges. Respects immunity (Stone, Metal, Clone, Void).
- **Spawning**: Create new particle in adjacent empty cell. Always `markMoved()` on the new cell.

## Key Constants

- Grid dimensions are **dynamic** — computed at runtime from window size (`CELL_SIZE = 4` pixels per cell). `Game.tsx` uses a `ResizeObserver` to recreate `Simulation` and `Renderer` when the container resizes.
- `PARTICLE_COUNT = 25` (types.ts) — size of all lookup tables and `UPDATE_FN` array.
- `CHUNK_SIZE = 8`, `CHUNK_SHIFT = 3` (grid.ts) — exported constants for chunk dimensions. Power-of-2 enables bit-shift indexing.
- Out-of-bounds `grid.get()` returns `ParticleType.Stone` — natural wall behavior.
