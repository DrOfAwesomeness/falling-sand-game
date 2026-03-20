import type { Grid } from "./grid";
import {
  ParticleType,
  DENSITY,
  IS_LIQUID,
  IS_GAS,
  IS_FLAMMABLE,
  IS_STATIC,
  MAX_LIFETIME,
} from "./types";

type UpdateFn = (grid: Grid, x: number, y: number) => void;

export const UPDATE_FN: (UpdateFn | null)[] = new Array(25).fill(null);

function canDisplace(mover: ParticleType, target: ParticleType): boolean {
  if (target === ParticleType.Empty) return true;
  if (target === ParticleType.Stone) return false;
  if (IS_STATIC[target]) return false;
  if (!IS_LIQUID[target] && !IS_GAS[target]) return false;
  return DENSITY[mover] > DENSITY[target];
}

function randBool(): boolean {
  return Math.random() < 0.5;
}

function setAndMarkMoved(grid: Grid, x: number, y: number, type: ParticleType): void {
  if (!grid.inBounds(x, y)) return;
  grid.set(x, y, type);
  grid.markMoved(x, y);
}

function tryMoveToEmpty(grid: Grid, x: number, y: number, targetX: number, targetY: number): boolean {
  if (grid.get(targetX, targetY) !== ParticleType.Empty) return false;
  grid.moveTo(x, y, targetX, targetY);
  return true;
}

function trySwapDisplace(grid: Grid, x: number, y: number, targetX: number, targetY: number, mover: ParticleType): boolean {
  if (!canDisplace(mover, grid.get(targetX, targetY))) return false;
  grid.swap(x, y, targetX, targetY);
  return true;
}

function tryDiagonalDisplace(grid: Grid, x: number, y: number, yDir: number, mover: ParticleType, leftFirst: boolean): number {
  const firstDir = leftFirst ? -1 : 1;
  if (trySwapDisplace(grid, x, y, x + firstDir, y + yDir, mover)) return firstDir;

  const secondDir = -firstDir;
  if (trySwapDisplace(grid, x, y, x + secondDir, y + yDir, mover)) return secondDir;

  return 0;
}

function tryDiagonalEmpty(grid: Grid, x: number, y: number, yDir: number, leftFirst: boolean): number {
  const firstDir = leftFirst ? -1 : 1;
  if (tryMoveToEmpty(grid, x, y, x + firstDir, y + yDir)) return firstDir;

  const secondDir = -firstDir;
  if (tryMoveToEmpty(grid, x, y, x + secondDir, y + yDir)) return secondDir;

  return 0;
}

function tryLateralDrift(grid: Grid, x: number, y: number, leftFirst: boolean): number {
  const firstDir = leftFirst ? -1 : 1;
  if (tryMoveToEmpty(grid, x, y, x + firstDir, y)) return firstDir;

  const secondDir = -firstDir;
  if (tryMoveToEmpty(grid, x, y, x + secondDir, y)) return secondDir;

  return 0;
}

function tryLateralFlowDir(grid: Grid, x: number, y: number, dir: number, maxDistance: number): number {
  let targetX = x;

  for (let distance = 1; distance <= maxDistance; distance++) {
    const nextX = x + dir * distance;
    if (grid.get(nextX, y) !== ParticleType.Empty) break;
    targetX = nextX;
  }

  if (targetX === x) return 0;

  grid.moveTo(x, y, targetX, y);
  return targetX - x;
}

function tryLateralFlow(grid: Grid, x: number, y: number, maxDistance: number, leftFirst: boolean): number {
  const firstDir = leftFirst ? -1 : 1;
  const firstMove = tryLateralFlowDir(grid, x, y, firstDir, maxDistance);
  if (firstMove !== 0) return firstMove;
  return tryLateralFlowDir(grid, x, y, -firstDir, maxDistance);
}

function explode(grid: Grid, x: number, y: number, radius: number): void {
  const radiusSquared = radius * radius;

  for (let dy = -radius; dy <= radius; dy++) {
    const py = y + dy;
    if (py < 0 || py >= grid.height) continue;

    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radiusSquared) continue;

      const px = x + dx;
      if (px < 0 || px >= grid.width) continue;

      const particle = grid.get(px, py);
      if (
        particle === ParticleType.Stone ||
        particle === ParticleType.Metal ||
        particle === ParticleType.Clone ||
        particle === ParticleType.Void
      ) {
        continue;
      }

      grid.set(px, py, ParticleType.Fire);
      grid.markMoved(px, py);
    }
  }
}

function spawnEmberBelow(grid: Grid, x: number, y: number): void {
  const emberX = x + (((Math.random() * 3) | 0) - 1);
  const emberY = y + 1;
  if (grid.get(emberX, emberY) !== ParticleType.Empty) return;
  setAndMarkMoved(grid, emberX, emberY, ParticleType.Ember);
}

function clearWithVoid(grid: Grid, x: number, y: number): void {
  const particle = grid.get(x, y);
  if (
    particle === ParticleType.Empty ||
    particle === ParticleType.Void ||
    particle === ParticleType.Clone ||
    particle === ParticleType.Stone
  ) {
    return;
  }

  grid.set(x, y, ParticleType.Empty);
}

function updatePowder(grid: Grid, x: number, y: number, type: ParticleType): void {
  if (trySwapDisplace(grid, x, y, x, y + 1, type)) return;
  tryDiagonalDisplace(grid, x, y, 1, type, randBool());
}

function updateLiquid(grid: Grid, x: number, y: number, spreadDistance: number): void {
  if (tryMoveToEmpty(grid, x, y, x, y + 1)) return;

  const leftFirst = randBool();
  if (tryDiagonalEmpty(grid, x, y, 1, leftFirst) !== 0) return;

  tryLateralFlow(grid, x, y, spreadDistance, leftFirst);
}

function updateSand(grid: Grid, x: number, y: number): void {
  if (grid.get(x, y + 1) === ParticleType.Lava && Math.random() < 0.03) {
    grid.set(x, y, ParticleType.Glass);
    return;
  }

  updatePowder(grid, x, y, ParticleType.Sand);
}

function updateWater(grid: Grid, x: number, y: number): void {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;

      const nx = x + dx;
      const ny = y + dy;
      const neighbor = grid.get(nx, ny);
      if (neighbor !== ParticleType.Sand && neighbor !== ParticleType.Salt) continue;
      if (Math.random() >= 0.02) continue;

      grid.set(x, y, ParticleType.Mud);
      grid.set(nx, ny, ParticleType.Empty);
      return;
    }
  }

  updateLiquid(grid, x, y, 4);
}

function updateFire(grid: Grid, x: number, y: number): void {
  const lifetime = grid.incrementLifetime(x, y);
  if (lifetime > MAX_LIFETIME[ParticleType.Fire]) {
    if (Math.random() < 0.4) {
      grid.setKeepVariant(x, y, ParticleType.Smoke);
    } else {
      grid.set(x, y, ParticleType.Empty);
    }
    return;
  }

  let px = x;
  let py = y;
  const leftFirst = randBool();

  if (tryMoveToEmpty(grid, px, py, px, py - 1)) {
    py--;
  } else {
    const diagonal = tryDiagonalEmpty(grid, px, py, -1, leftFirst);
    if (diagonal !== 0) {
      px += diagonal;
      py--;
    } else {
      px += tryLateralDrift(grid, px, py, leftFirst);
    }
  }

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;

      const nx = px + dx;
      const ny = py + dy;
      if (grid.get(nx, ny) !== ParticleType.Water) continue;

      grid.set(px, py, ParticleType.Steam);
      setAndMarkMoved(grid, nx, ny, ParticleType.Steam);
      return;
    }
  }

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;

      const nx = px + dx;
      const ny = py + dy;
      const neighbor = grid.get(nx, ny);
      if (!IS_FLAMMABLE[neighbor]) continue;
      if (Math.random() >= 0.3) continue;

      setAndMarkMoved(grid, nx, ny, ParticleType.Fire);

      if ((neighbor === ParticleType.Wood || neighbor === ParticleType.Plant) && Math.random() < 0.15) {
        spawnEmberBelow(grid, px, py);
      }
    }
  }
}

function updateOil(grid: Grid, x: number, y: number): void {
  if (grid.get(x, y - 1) === ParticleType.Water) {
    grid.swap(x, y, x, y - 1);
    return;
  }

  updateLiquid(grid, x, y, 4);
}

function updateSmoke(grid: Grid, x: number, y: number): void {
  const lifetime = grid.incrementLifetime(x, y);
  if (lifetime > MAX_LIFETIME[ParticleType.Smoke]) {
    grid.set(x, y, ParticleType.Empty);
    return;
  }

  if (tryMoveToEmpty(grid, x, y, x, y - 1)) return;

  const leftFirst = randBool();
  if (tryDiagonalEmpty(grid, x, y, -1, leftFirst) !== 0) return;

  tryLateralDrift(grid, x, y, leftFirst);
}

function updateSteam(grid: Grid, x: number, y: number): void {
  const lifetime = grid.incrementLifetime(x, y);
  if (lifetime > MAX_LIFETIME[ParticleType.Steam]) {
    grid.set(x, y, ParticleType.Water);
    return;
  }

  if (tryMoveToEmpty(grid, x, y, x, y - 1)) return;

  const leftFirst = randBool();
  if (tryDiagonalEmpty(grid, x, y, -1, leftFirst) !== 0) return;

  tryLateralFlow(grid, x, y, 2, leftFirst);
}

function updateGunpowder(grid: Grid, x: number, y: number): void {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;

      const neighbor = grid.get(x + dx, y + dy);
      if (neighbor !== ParticleType.Fire && neighbor !== ParticleType.Lava) continue;

      explode(grid, x, y, 3);
      return;
    }
  }

  updatePowder(grid, x, y, ParticleType.Gunpowder);
}

function updateLava(grid: Grid, x: number, y: number): void {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;

      const nx = x + dx;
      const ny = y + dy;
      const neighbor = grid.get(nx, ny);

      if (neighbor === ParticleType.Water) {
        grid.set(x, y, ParticleType.Stone);
        setAndMarkMoved(grid, nx, ny, ParticleType.Steam);
        return;
      }

      if (neighbor === ParticleType.Ice) {
        grid.set(x, y, ParticleType.Steam);
        setAndMarkMoved(grid, nx, ny, ParticleType.Steam);
        return;
      }
    }
  }

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;

      const nx = x + dx;
      const ny = y + dy;
      const neighbor = grid.get(nx, ny);

      if (IS_FLAMMABLE[neighbor]) {
        if (Math.random() < 0.15) {
          setAndMarkMoved(grid, nx, ny, ParticleType.Fire);
        }
        continue;
      }

      if (neighbor === ParticleType.Sand) {
        if (Math.random() < 0.05) {
          setAndMarkMoved(grid, nx, ny, ParticleType.Glass);
        }
        continue;
      }

      if (neighbor === ParticleType.Stone && Math.random() < 0.005) {
        setAndMarkMoved(grid, nx, ny, ParticleType.Lava);
      }
    }
  }

  if (Math.random() < 0.5) return;
  updateLiquid(grid, x, y, 4);
}

function updateAcid(grid: Grid, x: number, y: number): void {
  let nx = x;
  let ny = y;

  switch ((Math.random() * 8) | 0) {
    case 0:
      nx = x - 1;
      ny = y - 1;
      break;
    case 1:
      nx = x;
      ny = y - 1;
      break;
    case 2:
      nx = x + 1;
      ny = y - 1;
      break;
    case 3:
      nx = x - 1;
      ny = y;
      break;
    case 4:
      nx = x + 1;
      ny = y;
      break;
    case 5:
      nx = x - 1;
      ny = y + 1;
      break;
    case 6:
      nx = x;
      ny = y + 1;
      break;
    default:
      nx = x + 1;
      ny = y + 1;
      break;
  }

  if (grid.inBounds(nx, ny)) {
    const neighbor = grid.get(nx, ny);
    if (
      neighbor !== ParticleType.Empty &&
      neighbor !== ParticleType.Acid &&
      neighbor !== ParticleType.Glass &&
      neighbor !== ParticleType.Mercury
    ) {
      let dissolveChance = 0.15;
      if (neighbor === ParticleType.Stone) {
        dissolveChance = 0.02;
      } else if (neighbor === ParticleType.Metal) {
        dissolveChance = 0.01;
      }

      if (Math.random() < dissolveChance) {
        grid.set(nx, ny, ParticleType.Empty);

        if (grid.get(x, y - 1) === ParticleType.Empty && Math.random() < 0.3) {
          setAndMarkMoved(grid, x, y - 1, ParticleType.ToxicGas);
        }

        if (Math.random() < 0.5) {
          grid.set(x, y, ParticleType.Empty);
          return;
        }
      }
    }
  }

  updateLiquid(grid, x, y, 4);
}

function updatePlant(grid: Grid, x: number, y: number): void {
  let waterCount = 0;
  let growX = x;
  let growY = y;
  let hasPoison = false;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;

      const nx = x + dx;
      const ny = y + dy;
      const neighbor = grid.get(nx, ny);

      if (neighbor === ParticleType.ToxicGas || neighbor === ParticleType.Mercury) {
        hasPoison = true;
      }

      if (neighbor !== ParticleType.Water) continue;

      waterCount++;
      if (Math.random() * waterCount < 1) {
        growX = nx;
        growY = ny;
      }
    }
  }

  if (hasPoison && Math.random() < 0.1) {
    grid.set(x, y, ParticleType.Empty);
    return;
  }

  if (waterCount === 0) return;
  if (Math.random() >= 0.02) return;

  setAndMarkMoved(grid, growX, growY, ParticleType.Plant);
}

function updateIce(grid: Grid, x: number, y: number): void {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;

      const neighbor = grid.get(x + dx, y + dy);
      if (neighbor !== ParticleType.Fire && neighbor !== ParticleType.Lava) continue;

      grid.set(x, y, ParticleType.Water);
      return;
    }
  }

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;

      const nx = x + dx;
      const ny = y + dy;
      if (grid.get(nx, ny) !== ParticleType.Water) continue;
      if (Math.random() >= 0.01) continue;

      setAndMarkMoved(grid, nx, ny, ParticleType.Ice);
    }
  }
}

function updateSalt(grid: Grid, x: number, y: number): void {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;

      const nx = x + dx;
      const ny = y + dy;
      if (grid.get(nx, ny) !== ParticleType.Water) continue;
      if (Math.random() >= 0.08) continue;

      grid.set(x, y, ParticleType.Empty);
      grid.set(nx, ny, ParticleType.Empty);
      return;
    }
  }

  updatePowder(grid, x, y, ParticleType.Salt);
}

function updateMetal(grid: Grid, x: number, y: number): void {
  let isHeated = false;

  for (let dy = -1; dy <= 1 && !isHeated; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;

      const neighbor = grid.get(x + dx, y + dy);
      if (neighbor !== ParticleType.Fire && neighbor !== ParticleType.Lava) continue;

      isHeated = true;
      break;
    }
  }

  if (!isHeated) return;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;

      const nx = x + dx;
      const ny = y + dy;
      const neighbor = grid.get(nx, ny);
      if (!IS_FLAMMABLE[neighbor]) continue;
      if (Math.random() >= 0.1) continue;

      setAndMarkMoved(grid, nx, ny, ParticleType.Fire);
    }
  }
}

function updateEmber(grid: Grid, x: number, y: number): void {
  const lifetime = grid.incrementLifetime(x, y);
  if (lifetime > MAX_LIFETIME[ParticleType.Ember]) {
    if (Math.random() < 0.4) {
      grid.setKeepVariant(x, y, ParticleType.Smoke);
    } else {
      grid.set(x, y, ParticleType.Empty);
    }
    return;
  }

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;

      const nx = x + dx;
      const ny = y + dy;
      const neighbor = grid.get(nx, ny);
      if (!IS_FLAMMABLE[neighbor]) continue;
      if (Math.random() >= 0.25) continue;

      setAndMarkMoved(grid, nx, ny, ParticleType.Fire);
    }
  }

  updatePowder(grid, x, y, ParticleType.Ember);
}

function updateMud(grid: Grid, x: number, y: number): void {
  const lifetime = grid.incrementLifetime(x, y);

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;

      const neighbor = grid.get(x + dx, y + dy);
      if (neighbor !== ParticleType.Fire && neighbor !== ParticleType.Lava) continue;
      if (Math.random() >= 0.03) continue;

      grid.set(x, y, ParticleType.Sand);
      return;
    }
  }

  if (lifetime % 3 !== 0) return;
  updateLiquid(grid, x, y, 2);
}

function updateMercury(grid: Grid, x: number, y: number): void {
  let px = x;
  let py = y;
  const below = grid.get(x, y + 1);

  if (IS_LIQUID[below] && below !== ParticleType.Mercury) {
    grid.swap(x, y, x, y + 1);
    py++;
  }

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;

      const nx = px + dx;
      const ny = py + dy;
      if (grid.get(nx, ny) !== ParticleType.Plant) continue;

      grid.set(nx, ny, ParticleType.Empty);
    }
  }

  updateLiquid(grid, px, py, 3);
}

function updateToxicGas(grid: Grid, x: number, y: number): void {
  const lifetime = grid.incrementLifetime(x, y);
  if (lifetime > MAX_LIFETIME[ParticleType.ToxicGas]) {
    grid.set(x, y, ParticleType.Empty);
    return;
  }

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;

      if (grid.get(x + dx, y + dy) !== ParticleType.Fire) continue;

      explode(grid, x, y, 2);
      return;
    }
  }

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;

      const nx = x + dx;
      const ny = y + dy;
      if (grid.get(nx, ny) !== ParticleType.Plant) continue;
      if (Math.random() >= 0.15) continue;

      grid.set(nx, ny, ParticleType.Empty);
    }
  }

  if (tryMoveToEmpty(grid, x, y, x, y - 1)) return;

  const leftFirst = randBool();
  if (tryDiagonalEmpty(grid, x, y, -1, leftFirst) !== 0) return;

  tryLateralDrift(grid, x, y, leftFirst);
}

function updateHydrogen(grid: Grid, x: number, y: number): void {
  const lifetime = grid.incrementLifetime(x, y);
  if (lifetime > MAX_LIFETIME[ParticleType.Hydrogen]) {
    grid.set(x, y, ParticleType.Empty);
    return;
  }

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;

      const neighbor = grid.get(x + dx, y + dy);
      if (
        neighbor !== ParticleType.Fire &&
        neighbor !== ParticleType.Lava &&
        neighbor !== ParticleType.Ember
      ) {
        continue;
      }

      explode(grid, x, y, 5);
      return;
    }
  }

  if (
    grid.get(x, y - 1) === ParticleType.Empty &&
    grid.get(x, y - 2) === ParticleType.Empty
  ) {
    grid.moveTo(x, y, x, y - 2);
    return;
  }

  if (tryMoveToEmpty(grid, x, y, x, y - 1)) return;

  const leftFirst = randBool();
  if (tryDiagonalEmpty(grid, x, y, -1, leftFirst) !== 0) return;

  tryLateralDrift(grid, x, y, leftFirst);
}

function updateFuse(grid: Grid, x: number, y: number): void {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;

      const neighbor = grid.get(x + dx, y + dy);
      if (
        neighbor !== ParticleType.Fire &&
        neighbor !== ParticleType.Lava &&
        neighbor !== ParticleType.Ember
      ) {
        continue;
      }

      grid.set(x, y, ParticleType.Fire);
      return;
    }
  }
}

function updateClone(grid: Grid, x: number, y: number): void {
  const aboveType = grid.get(x, y - 1);
  if (
    aboveType === ParticleType.Empty ||
    aboveType === ParticleType.Clone ||
    aboveType === ParticleType.Void
  ) {
    return;
  }

  if (grid.get(x, y + 1) !== ParticleType.Empty) return;

  grid.set(x, y + 1, aboveType);
  grid.markMoved(x, y + 1);
}

function updateVoid(grid: Grid, x: number, y: number): void {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      clearWithVoid(grid, x + dx, y + dy);
    }
  }

  clearWithVoid(grid, x, y - 1);
  clearWithVoid(grid, x, y + 1);
}

UPDATE_FN[ParticleType.Empty] = null;
UPDATE_FN[ParticleType.Sand] = updateSand;
UPDATE_FN[ParticleType.Water] = updateWater;
UPDATE_FN[ParticleType.Stone] = null;
UPDATE_FN[ParticleType.Fire] = updateFire;
UPDATE_FN[ParticleType.Wood] = null;
UPDATE_FN[ParticleType.Oil] = updateOil;
UPDATE_FN[ParticleType.Smoke] = updateSmoke;
UPDATE_FN[ParticleType.Steam] = updateSteam;
UPDATE_FN[ParticleType.Gunpowder] = updateGunpowder;
UPDATE_FN[ParticleType.Lava] = updateLava;
UPDATE_FN[ParticleType.Acid] = updateAcid;
UPDATE_FN[ParticleType.Plant] = updatePlant;
UPDATE_FN[ParticleType.Ice] = updateIce;
UPDATE_FN[ParticleType.Salt] = updateSalt;
UPDATE_FN[ParticleType.Glass] = null;
UPDATE_FN[ParticleType.Metal] = updateMetal;
UPDATE_FN[ParticleType.Ember] = updateEmber;
UPDATE_FN[ParticleType.Mud] = updateMud;
UPDATE_FN[ParticleType.Mercury] = updateMercury;
UPDATE_FN[ParticleType.ToxicGas] = updateToxicGas;
UPDATE_FN[ParticleType.Hydrogen] = updateHydrogen;
UPDATE_FN[ParticleType.Fuse] = updateFuse;
UPDATE_FN[ParticleType.Clone] = updateClone;
UPDATE_FN[ParticleType.Void] = updateVoid;
