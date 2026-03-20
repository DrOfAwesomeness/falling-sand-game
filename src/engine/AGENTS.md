# Engine AGENTS.md

Pure TypeScript simulation engine. Zero React imports, zero DOM dependencies (except `renderer.ts`). This is the hot path — every function here runs 30,000 times per frame.

## File Responsibilities

| File | Purpose | Hot path? |
|---|---|---|
| `types.ts` | `ParticleType` const enum, 9 property lookup tables, color tables | Read-only lookups |
| `grid.ts` | `Grid` class — flat typed array storage for cell state | Yes — every cell access |
| `particles.ts` | Per-type update functions + `UPDATE_FN` dispatch table | Yes — core simulation |
| `simulation.ts` | `Simulation` orchestrator — step loop, paint/erase/clear | Yes — drives frame |
| `renderer.ts` | `Renderer` — ImageData pixel writer (only file touching DOM) | Yes — every frame |

## Grid Memory Layout

Grid stores 4 parallel flat arrays indexed by `y * width + x`:

- **`cells`** (`Uint8Array`) — `ParticleType` value per cell (0–24). One byte each.
- **`moved`** (`Uint8Array`) — boolean flag, prevents double-updates within a single frame step.
- **`lifetime`** (`Uint16Array`) — frame counter per cell. Used for timed behaviors (Fire, Smoke, Steam, Ember).
- **`colorVariant`** (`Uint8Array`) — random 0–2 index assigned at creation for visual variety.

**Critical invariant**: `cells[i]` and `colorVariant[i]` must stay in sync. When a particle transforms (e.g., Water→Steam), use `grid.setKeepVariant()` to preserve the color variant index, not `grid.set()` which randomizes it.

## Simulation Step Order

Each `Simulation.step()`:

1. `grid.clearMoved()` — reset all moved flags.
2. Iterate rows **bottom-to-top** (gravity falls downward, process settled particles first).
3. Alternate column sweep direction **per frame** (left-to-right on even frames, right-to-left on odd) to prevent directional bias.
4. Skip cells that are `Empty`, `isMoved`, or have no `UPDATE_FN` entry.
5. Call `UPDATE_FN[type](grid, x, y)` for each active cell.

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
- Out-of-bounds `grid.get()` returns `ParticleType.Stone` — natural wall behavior.
