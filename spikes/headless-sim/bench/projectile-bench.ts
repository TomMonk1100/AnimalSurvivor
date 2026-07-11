/** Projectile-saturation complement to bench.ts's 1,000-enemy workload. */
import os from 'node:os';
import type { SimConfig } from '../src/config.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { createSimulation } from '../src/simulation.js';

const ENEMIES = 250;
const PROJECTILES = 500;
const WARMUP_TICKS = 20;
const MEASURED_TICKS = 100;

const config: SimConfig = {
  ...DEFAULT_CONFIG,
  enemyCap: 1200,
  projectileCap: 500,
  pickupCap: 50,
  waves: [],
  player: { ...DEFAULT_CONFIG.player, maxHp: 1e9 },
  weapon: {
    ...DEFAULT_CONFIG.weapon,
    cooldownTicks: 1,
    range: 900,
    projectileSpeed: 30,
    damage: 0,
    lifetimeTicks: 1000,
    hitRadius: 0,
    pierce: 255,
  },
  archetypes: [
    { name: 'bench-anchor', hp: 1e9, speed: 0, radius: 0, touchDamage: 0, xpDrop: 0 },
  ],
};

function percentile(sorted: Float64Array, p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]! / 1000;
}

const sim = createSimulation(config, 0xdecafbad);
for (let i = 0; i < ENEMIES; i++) {
  const slot = sim.enemies.spawn();
  if (slot < 0) throw new Error('enemy fixture pool unexpectedly full');
  const angle = (i / ENEMIES) * Math.PI * 2;
  const radius = 250 + (i % 20) * 25;
  const x = sim.player.x + Math.cos(angle) * radius;
  const y = sim.player.y + Math.sin(angle) * radius;
  const d = sim.enemies.data;
  d.posX[slot] = x; d.posY[slot] = y; d.hp[slot] = 1e9; d.maxHp[slot] = 1e9;
  d.speed[slot] = 0; d.radius[slot] = 0; d.touchDamage[slot] = 0;
  d.archetype[slot] = 0; d.xpDrop[slot] = 0;
  sim.grid.insert(sim.enemies.idOf(slot), x, y);
}

for (let i = 0; i < PROJECTILES; i++) {
  const slot = sim.projectiles.spawn();
  if (slot < 0) throw new Error('projectile fixture pool unexpectedly full');
  const angle = (i / PROJECTILES) * Math.PI * 2;
  const d = sim.projectiles.data;
  d.posX[slot] = sim.player.x; d.posY[slot] = sim.player.y;
  d.velX[slot] = Math.cos(angle) * config.weapon.projectileSpeed;
  d.velY[slot] = Math.sin(angle) * config.weapon.projectileSpeed;
  d.damage[slot] = 0; d.lifetime[slot] = config.weapon.lifetimeTicks;
  d.hitRadius[slot] = 0; d.pierce[slot] = 255; d.faction[slot] = 0;
}

const input = { moveX: 0, moveY: 0, paused: false };
for (let i = 0; i < WARMUP_TICKS; i++) sim.step(input);

const timings = new Float64Array(MEASURED_TICKS);
for (let i = 0; i < MEASURED_TICKS; i++) {
  const start = process.hrtime.bigint();
  sim.step(input);
  timings[i] = Number(process.hrtime.bigint() - start);
}
const sorted = Float64Array.from(timings).sort();
const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length / 1000;

console.log('=== projectile-saturation benchmark ===');
console.log(`node ${process.version} | ${process.platform}/${process.arch} | cpu: ${os.cpus()[0]?.model ?? 'unknown'}`);
console.log(`enemies: ${sim.enemies.data.count}; projectiles: ${sim.projectiles.data.count}`);
console.log(`projectile high-water: ${sim.projectiles.data.highWater} / ${sim.projectiles.data.capacity}`);
console.log(`mean: ${mean.toFixed(2)} us; p95: ${percentile(sorted, 0.95).toFixed(2)} us; p99: ${percentile(sorted, 0.99).toFixed(2)} us`);
console.log(`final tick: ${sim.tick}; final hash: ${sim.hash()}`);
