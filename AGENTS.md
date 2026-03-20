# AGENTS.md

Falling sand game built with Bun + React 19 + TypeScript. HTML5 Canvas renderer, 25 particle types, dark-themed UI.

## Architecture

```
src/
  index.ts          — Bun HTTP server entry (dev: bun --hot)
  index.html        — HTML shell, loads frontend.tsx
  frontend.tsx      — React DOM bootstrap with HMR persistence
  App.tsx           — Root component, state management, composes Toolbar + Game
  index.css         — Global styles (dark industrial theme, toolbar categories, canvas scaling)
  engine/           — Pure TypeScript simulation (zero React imports) → see engine/AGENTS.md
    types.ts        — ParticleType const enum, property tables, color tables
    grid.ts         — Grid class (Uint8Array cell storage)
    particles.ts    — All particle update functions + UPDATE_FN dispatch table
    simulation.ts   — Simulation class (step/paint/erase/clear)
    renderer.ts     — ImageData canvas renderer with color lookup table
  components/
    Game.tsx        — Canvas + requestAnimationFrame loop + pointer input + Bresenham line drawing + dynamic grid sizing (ResizeObserver) + debug overlay (D key)
    Toolbar.tsx     — 5-category material picker + controls + FPS counter
```

**Layer boundary**: Engine has zero React imports. Components import from engine but never the reverse. The API surface between layers:
- Components consume: `Simulation` (construct, step, paint, erase, clear), `Renderer` (construct, render), and metadata from `types.ts` (ParticleType, PARTICLE_NAMES, UI_COLORS, PLACEABLE_TYPES).
- `Simulation.grid` is passed directly to `Renderer.render()` for zero-copy performance.

## Toolchain

- **Runtime**: Bun (not Node). `bun --hot src/index.ts` for dev, `bun build ./src/index.html` for production.
- **Build**: Bun bundler targets browser. No webpack/vite/rollup.
- **Dependencies**: React 19 + react-dom only. Zero other runtime dependencies.
- **No linter/formatter config** checked in. No .eslintrc, no .editorconfig.

## TypeScript Conventions

- **Strict mode** with `noUncheckedIndexedAccess: true` — array indexing returns `T | undefined`. Handle it explicitly; never suppress with `!` post-fix assertion unless the index is provably safe.
- **`verbatimModuleSyntax: true`** — use `import type { X }` for type-only imports. Plain `import { X }` for values. The compiler enforces this.
- **`const enum`** for `ParticleType` — values are inlined at compile time for Uint8Array storage. Do not convert to regular enum (breaks memory layout).
- **No `as any`**, no `@ts-ignore`, no `@ts-expect-error`** — fix types properly.
- **`allowImportingTsExtensions: true`** — imports use `.ts`/`.tsx` extensions.
- **Path alias**: `@/*` maps to `./src/*` (configured but not currently used in code).

## CSS Architecture

- Dark industrial theme with CSS custom properties.
- Canvas renders at native grid resolution (dynamically sized to window, CELL_SIZE=4px), CSS scales up with `image-rendering: pixelated`.
- Toolbar uses 5 category groups (SOLIDS, POWDERS, LIQUIDS, GASES, SPECIAL) in a two-row layout.
- Responsive: desktop padding 100px, mobile 160px for toolbar clearance.

## Performance Targets

- 60fps on a 200×150 grid (30,000 cells per frame).
- Grid stored as flat `Uint8Array` — one byte per cell.
- Rendering via `ImageData` + `Uint32Array` view (ABGR byte order, little-endian).
- No object allocation in the hot path. Typed arrays only.

## Adding New Particle Types

1. Add entry to `ParticleType` const enum in `types.ts` (next sequential number).
2. Update `PARTICLE_COUNT`.
3. Add entries to ALL 9 property tables: DENSITY, IS_LIQUID, IS_GAS, IS_FLAMMABLE, IS_STATIC, MAX_LIFETIME, PARTICLE_COLORS, UI_COLORS, PARTICLE_NAMES.
4. Add to `PLACEABLE_TYPES` if user-selectable.
5. Write update function in `particles.ts` and register in `UPDATE_FN` array.
6. Toolbar categories in `Toolbar.tsx` may need updating if the particle belongs to a new group.

## Common Mistakes to Avoid

- Importing React in engine files — engine must stay pure TypeScript.
- Using regular enum instead of const enum for ParticleType — breaks Uint8Array storage.
- Forgetting to update all 9 property tables when adding a particle type — causes runtime undefined access.
- Allocating objects in particle update functions — kills frame rate.
- Using `set()` instead of `setKeepVariant()` when transforming particles — resets color variation.
