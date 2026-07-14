/* global console, process, window, document, requestAnimationFrame, URL, getComputedStyle, HTMLButtonElement */
/**
 * Production-run evidence matrix for renderer-facing VFX families.
 *
 * This is deliberately an acceptance harness, not an effect spawner.  Each
 * target starts a normal deterministic autoplay run, chooses upgrades through
 * the player-visible DOM buttons, then waits for a real public driver event
 * or immutable snapshot before it captures compositor pixels.  It never calls
 * driver.selectUpgrade(), writes a simulation pool, manufactures a renderer
 * event, or reads canvas pixels to decide whether a target occurred.
 *
 * The short phase holds are presentation-control pauses only.  They keep a
 * headed compositor screenshot inside a live effect's truthful tick window;
 * all gameplay before and between holds advances at normal speed.  The report
 * makes that distinction explicit so the stills cannot be mistaken for a
 * continuous-motion recording.
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from 'playwright';
import { createCanvas, loadImage } from 'canvas';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const webToyRoot = resolve(scriptDirectory, '..');
const workspaceRoot = resolve(webToyRoot, '../..');
const capturesRoot = join(workspaceRoot, 'docs', 'vfx', 'captures');
const VIEWPORT = Object.freeze({ width: 1280, height: 720 });
const DEFAULT_TIMEOUT_SECONDS = 150;
const DEFAULT_PORT = 5206;
const NORMAL_SPEED_TICKS_PER_SECOND = 60;

class FamilyEvidenceError extends Error {}

function fail(message) {
  throw new FamilyEvidenceError(`[vfx-family-evidence] ${message}`);
}

function freezeTarget(target) {
  return Object.freeze({
    ...target,
    phases: Object.freeze(target.phases.map((phase) => Object.freeze({ ...phase }))),
    upgrade: target.upgrade === undefined
      ? undefined
      : Object.freeze({
        ...target.upgrade,
        traits: Object.freeze([...(target.upgrade.traits ?? [])]),
        universals: Object.freeze([...(target.upgrade.universals ?? [])]),
        avoidTraits: Object.freeze([...(target.upgrade.avoidTraits ?? [])]),
      }),
    primary: Object.freeze({ ...target.primary }),
    secondary: target.secondary === undefined ? undefined : Object.freeze({ ...target.secondary }),
    phaseSnapshot: target.phaseSnapshot === undefined ? undefined : Object.freeze({
      ...target.phaseSnapshot,
      labels: Object.freeze([...(target.phaseSnapshot.labels ?? [])]),
    }),
  });
}

/**
 * The matrix intentionally names the real source/tag/kind contracts used by
 * the renderer.  A future content rename makes a target BLOCKED instead of
 * letting a generic hit card masquerade as a reviewed family.
 */
const TARGETS = Object.freeze([
  freezeTarget({
    id: 'puffer-field',
    label: 'Puffer Pouch field pulse',
    family: 'zones-fields',
    hero: 'greg',
    upgrade: { traits: ['puffer-pouch'] },
    primary: { type: 'event', stream: 'trait', kinds: ['areaGather', 'areaKnockback'], sourceId: 'puffer-pouch' },
    phases: [{ label: 'birth', tickDelta: 1 }, { label: 'peak', tickDelta: 5 }, { label: 'release', tickDelta: 10 }],
  }),
  freezeTarget({
    id: 'gecko-pad',
    label: 'Gecko Pads persistent field',
    family: 'zones-fields',
    hero: 'greg',
    upgrade: { traits: ['gecko-pads'] },
    primary: { type: 'event', stream: 'trait', kind: 'spawnZone', sourceId: 'gecko-pads', tag: 'gecko-pad' },
    phases: [{ label: 'birth', tickDelta: 1 }, { label: 'mature', tickDelta: 18 }, { label: 'settle', tickDelta: 54 }],
    phaseSnapshot: { category: 'zones', source: 4, role: 1, nearPrimary: true, labels: ['birth', 'mature'] },
    secondary: { type: 'snapshot', category: 'zones', source: 4, role: 1, nearPrimary: true, minimumTickDelta: 1 },
  }),
  freezeTarget({
    id: 'skunk-cloud',
    label: 'Skunk Brush persistent cloud',
    family: 'zones-fields',
    hero: 'greg',
    upgrade: { traits: ['skunk-brush'] },
    primary: { type: 'event', stream: 'trait', kind: 'spawnZone', sourceId: 'skunk-brush', tag: 'stink-cloud' },
    phases: [{ label: 'birth', tickDelta: 1 }, { label: 'mature', tickDelta: 12 }, { label: 'settle', tickDelta: 48 }],
    phaseSnapshot: { category: 'zones', source: 4, role: 3, nearPrimary: true, labels: ['birth', 'mature'] },
    secondary: { type: 'snapshot', category: 'zones', source: 4, role: 3, nearPrimary: true, minimumTickDelta: 1 },
  }),
  freezeTarget({
    id: 'royal-stinkcloud',
    label: 'Royal Stinkcloud mythic field',
    family: 'zones-fields',
    hero: 'greg',
    upgrade: {
      traits: ['skunk-brush', 'monarch-brood'],
      evolutionId: 'royal-stinkcloud',
      evolutionTitle: 'Royal Stinkcloud',
      avoidTraits: ['electric-eel-coil', 'firefly-colony'],
    },
    primary: { type: 'event', stream: 'trait', kind: 'spawnZone', sourceId: 'royal-stinkcloud', tag: 'royal-stink' },
    phases: [{ label: 'birth', tickDelta: 1 }, { label: 'mature', tickDelta: 14 }, { label: 'settle', tickDelta: 58 }],
    phaseSnapshot: { category: 'zones', source: 4, role: 4, nearPrimary: true, labels: ['birth', 'mature'] },
    secondary: { type: 'snapshot', category: 'zones', source: 4, role: 4, nearPrimary: true, minimumTickDelta: 1 },
    timeoutSeconds: 540,
  }),
  freezeTarget({
    id: 'fluffy-shield',
    label: 'Gracie Fluffy Shield defense bridge',
    family: 'utility-aura',
    hero: 'gracie',
    upgrade: { universals: ['hero-trait:gracie-fluffy-shield'] },
    // The renderer's combat-defense bridge turns this real resolved shield
    // outcome into the fluffy-shield trait cue.  The driver correctly exposes
    // the authoritative outcome, not a fabricated downstream renderer record.
    primary: {
      type: 'event', stream: 'combat', kinds: ['shieldAbsorb', 'shieldBreak'],
      requiresSelectedId: 'universal:hero-trait:gracie-fluffy-shield',
    },
    phases: [{ label: 'shield-hit', tickDelta: 1 }, { label: 'body', tickDelta: 8 }, { label: 'release', tickDelta: 18 }],
    timeoutSeconds: 240,
  }),
  freezeTarget({
    id: 'firefly-colony',
    label: 'Firefly Colony orbit contact',
    family: 'utility-aura',
    hero: 'greg',
    upgrade: { traits: ['firefly-colony'] },
    primary: { type: 'event', stream: 'trait', kind: 'orbitingDamage', sourceId: 'firefly-colony' },
    phases: [{ label: 'orbit-contact', tickDelta: 1 }, { label: 'orbit-body', tickDelta: 8 }, { label: 'release', tickDelta: 18 }],
  }),
  freezeTarget({
    id: 'monarch-brood',
    label: 'Monarch Brood orbit contact',
    family: 'utility-aura',
    hero: 'greg',
    upgrade: { traits: ['monarch-brood'] },
    primary: { type: 'event', stream: 'trait', kind: 'orbitingDamage', sourceId: 'monarch-brood' },
    phases: [{ label: 'orbit-contact', tickDelta: 1 }, { label: 'orbit-body', tickDelta: 8 }, { label: 'release', tickDelta: 20 }],
  }),
  freezeTarget({
    id: 'bat-ears',
    label: 'Bat Ears sonar mark',
    family: 'utility-aura',
    hero: 'greg',
    upgrade: { traits: ['bat-ears'] },
    primary: { type: 'event', stream: 'trait', kind: 'markTargets', sourceId: 'bat-ears', tag: 'echo-mark' },
    phases: [{ label: 'ping', tickDelta: 1 }, { label: 'spread', tickDelta: 10 }, { label: 'release', tickDelta: 22 }],
  }),
  freezeTarget({
    id: 'midnight-radar',
    label: 'Midnight Radar mythic sonar',
    family: 'utility-aura',
    hero: 'greg',
    upgrade: {
      traits: ['owl-pinions', 'bat-ears'],
      evolutionId: 'midnight-radar',
      evolutionTitle: 'Midnight Radar',
      avoidTraits: ['puffer-pouch', 'mantis-scythes', 'gecko-pads', 'crab-pincers'],
    },
    primary: { type: 'event', stream: 'trait', kind: 'markTargets', sourceId: 'midnight-radar', tag: 'night-vision' },
    phases: [{ label: 'ping', tickDelta: 1 }, { label: 'spread', tickDelta: 12 }, { label: 'release', tickDelta: 26 }],
    timeoutSeconds: 540,
  }),
  freezeTarget({
    id: 'porcupine-quills',
    label: 'Porcupine Quills launch/travel/contact',
    family: 'snapshot-projectiles',
    hero: 'greg',
    upgrade: { traits: ['porcupine-quills'], avoidTraits: ['owl-pinions'] },
    primary: { type: 'event', stream: 'trait', kind: 'spawnProjectileBurst', sourceId: 'porcupine-quills' },
    phases: [{ label: 'launch', tickDelta: 1 }, { label: 'travel', tickDelta: 4 }, { label: 'contact-window', tickDelta: 8 }],
    phaseSnapshot: { category: 'projectiles', source: 2, nearPrimary: true, nearPrimaryDistance: 96, labels: ['launch'] },
    // Trait projectile damage uses the stable compact source code at impact.
    // This is source-correlated rather than falsely claiming an unavailable
    // per-projectile source string in the authoritative combat record.
    secondary: { type: 'event', stream: 'combat', kind: 'enemyHit', sourceId: 'trait-projectile', minimumTickDelta: 1 },
  }),
  freezeTarget({
    id: 'owl-pinions',
    label: 'Owl Pinions launch/travel/contact',
    family: 'snapshot-projectiles',
    hero: 'greg',
    upgrade: { traits: ['owl-pinions'], avoidTraits: ['porcupine-quills'] },
    primary: { type: 'event', stream: 'trait', kind: 'spawnProjectileBurst', sourceId: 'owl-pinions' },
    phases: [{ label: 'launch', tickDelta: 1 }, { label: 'travel', tickDelta: 4 }, { label: 'contact-window', tickDelta: 8 }],
    phaseSnapshot: { category: 'projectiles', source: 2, nearPrimary: true, nearPrimaryDistance: 96, labels: ['launch'] },
    secondary: { type: 'event', stream: 'combat', kind: 'enemyHit', sourceId: 'trait-projectile', minimumTickDelta: 1 },
  }),
  freezeTarget({
    id: 'thornstorm-mantle',
    label: 'Thornstorm launch/travel/contact',
    family: 'snapshot-projectiles',
    hero: 'greg',
    upgrade: {
      traits: ['porcupine-quills', 'puffer-pouch'],
      evolutionId: 'thornstorm-mantle',
      evolutionTitle: 'Thornstorm Mantle',
      avoidTraits: ['owl-pinions', 'bat-ears', 'crab-pincers', 'armadillo-greaves'],
    },
    primary: { type: 'event', stream: 'trait', kind: 'radialProjectileBurst', sourceId: 'thornstorm-mantle' },
    phases: [{ label: 'launch', tickDelta: 1 }, { label: 'travel', tickDelta: 4 }, { label: 'contact-window', tickDelta: 10 }],
    phaseSnapshot: { category: 'projectiles', source: 2, nearPrimary: true, nearPrimaryDistance: 96, labels: ['launch'] },
    secondary: { type: 'event', stream: 'combat', kind: 'enemyHit', sourceId: 'trait-projectile', minimumTickDelta: 1 },
    timeoutSeconds: 540,
  }),
  freezeTarget({
    id: 'impact-normal',
    label: 'Normal enemy impact',
    family: 'combat-impacts',
    hero: 'greg',
    primary: { type: 'event', stream: 'combat', kind: 'enemyHit', critical: false },
    phases: [{ label: 'core', tickDelta: 1 }, { label: 'body', tickDelta: 4 }, { label: 'release', tickDelta: 9 }],
  }),
  freezeTarget({
    id: 'impact-critical',
    label: 'Critical enemy impact',
    family: 'combat-impacts',
    hero: 'greg',
    primary: { type: 'event', stream: 'combat', kind: 'enemyHit', critical: true },
    phases: [{ label: 'core', tickDelta: 1 }, { label: 'body', tickDelta: 4 }, { label: 'release', tickDelta: 12 }],
    timeoutSeconds: 240,
  }),
  freezeTarget({
    id: 'impact-player',
    label: 'Player damage impact',
    family: 'combat-impacts',
    hero: 'greg',
    primary: { type: 'event', stream: 'combat', kind: 'playerHit' },
    phases: [{ label: 'core', tickDelta: 1 }, { label: 'body', tickDelta: 4 }, { label: 'release', tickDelta: 10 }],
    timeoutSeconds: 240,
  }),
  freezeTarget({
    id: 'pickup-xp',
    label: 'XP mote ground and collection',
    family: 'pickups',
    hero: 'greg',
    primary: { type: 'snapshot', category: 'pickups', minimumCount: 1 },
    phases: [{ label: 'grounded', tickDelta: 0 }, { label: 'readable-ground', tickDelta: 6 }],
    secondary: { type: 'snapshotMissing', category: 'pickups', requiresPlayerXpGain: true, minimumTickDelta: 1 },
  }),
  freezeTarget({
    id: 'pickup-bomb',
    label: 'Bomb ground and collection',
    family: 'pickups',
    hero: 'greg',
    primary: { type: 'snapshot', category: 'powerPickups', role: 1 },
    phases: [{ label: 'grounded', tickDelta: 0 }, { label: 'readable-ground', tickDelta: 8 }],
    secondary: { type: 'event', stream: 'combat', kind: 'pickup', pickupKind: 'bomb', nearPrimary: true, nearPrimaryDistance: 20, minimumTickDelta: 1 },
    timeoutSeconds: 300,
  }),
  freezeTarget({
    id: 'pickup-magnet',
    label: 'Magnet ground and collection',
    family: 'pickups',
    hero: 'greg',
    primary: { type: 'snapshot', category: 'powerPickups', role: 2 },
    phases: [{ label: 'grounded', tickDelta: 0 }, { label: 'readable-ground', tickDelta: 8 }],
    secondary: { type: 'event', stream: 'combat', kind: 'pickup', pickupKind: 'magnet', nearPrimary: true, nearPrimaryDistance: 20, minimumTickDelta: 1 },
    timeoutSeconds: 300,
  }),
  freezeTarget({
    id: 'pickup-food',
    label: 'Food ground and collection',
    family: 'pickups',
    hero: 'greg',
    primary: { type: 'snapshot', category: 'powerPickups', role: 3 },
    phases: [{ label: 'grounded', tickDelta: 0 }, { label: 'readable-ground', tickDelta: 8 }],
    secondary: { type: 'event', stream: 'combat', kind: 'pickup', pickupKind: 'food', nearPrimary: true, nearPrimaryDistance: 20, minimumTickDelta: 1 },
    timeoutSeconds: 300,
  }),
  freezeTarget({
    id: 'enemy-hostile-projectile',
    label: 'Hostile projectile threat ribbon',
    family: 'enemy-threats',
    hero: 'greg',
    primary: { type: 'snapshot', category: 'projectiles', role: 1, source: 3 },
    phases: [{ label: 'telegraph-head', tickDelta: 0 }, { label: 'travel', tickDelta: 4 }, { label: 'threat-read', tickDelta: 8 }],
    timeoutSeconds: 240,
  }),
  freezeTarget({
    id: 'enemy-charger',
    label: 'Charger wind-up telegraph',
    family: 'enemy-threats',
    hero: 'greg',
    // Role 4 is the simulation-owned charger role. The extra predicate uses
    // the same documented renderer-only wind-up cadence (24 / 180 ticks), so
    // a merely alive charger cannot stand in for an actual visible telegraph.
    primary: { type: 'snapshot', category: 'enemies', role: 4, chargerWindup: true },
    phases: [{ label: 'windup-start', tickDelta: 0 }, { label: 'windup-read', tickDelta: 7 }, { label: 'windup-release', tickDelta: 16 }],
    timeoutSeconds: 240,
  }),
  freezeTarget({
    id: 'enemy-boss',
    label: 'Boss arrival and telegraph',
    family: 'enemy-threats',
    hero: 'greg',
    primary: { type: 'event', stream: 'director', kinds: ['bossWarning', 'bossRequested'] },
    phases: [{ label: 'arrival', tickDelta: 1 }, { label: 'threat-read', tickDelta: 18 }, { label: 'arrival-release', tickDelta: 48 }],
    secondary: { type: 'snapshot', category: 'enemies', role: 2, minimumTickDelta: 1 },
    timeoutSeconds: 360,
  }),
]);

function normalizeIteration(value) {
  if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(value)) {
    fail(`iteration must contain only letters, digits, dots, underscores, or hyphens: ${value}`);
  }
  return value;
}

function isoIteration() {
  return `vfx-family-${new Date().toISOString().replace(/[:.]/gu, '-').replace(/Z$/u, 'Z')}`;
}

function parsePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) fail(`${label} must be a positive integer: ${value}`);
  return parsed;
}

function selectedTargets(ids) {
  if (ids.length === 0) return [...TARGETS];
  const byId = new Map(TARGETS.map((target) => [target.id, target]));
  return ids.map((id) => {
    const target = byId.get(id);
    if (target === undefined) fail(`unknown target ${id}; use --list-targets for the matrix`);
    return target;
  });
}

function parseArgs(argv) {
  const args = {
    allowBlocked: false,
    baseUrl: null,
    browserMode: 'headed',
    iteration: isoIteration(),
    maxAttempts: 1,
    port: DEFAULT_PORT,
    seed: '3',
    targetIds: [],
    timeoutSeconds: null,
  };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === '--allow-blocked') {
      args.allowBlocked = true;
    } else if (argument === '--base-url' && value) {
      args.baseUrl = value;
      index++;
    } else if (argument === '--headless') {
      args.browserMode = 'headless';
    } else if (argument === '--headed') {
      args.browserMode = 'headed';
    } else if (argument === '--iteration' && value) {
      args.iteration = normalizeIteration(value);
      index++;
    } else if (argument === '--max-attempts' && value) {
      args.maxAttempts = parsePositiveInteger(value, '--max-attempts');
      index++;
    } else if (argument === '--port' && value) {
      args.port = parsePositiveInteger(value, '--port');
      if (args.port > 65535) fail(`--port must be at most 65535: ${value}`);
      index++;
    } else if (argument === '--seed' && value) {
      args.seed = value;
      index++;
    } else if (argument === '--target' && value) {
      const ids = value.split(',').map((entry) => entry.trim()).filter(Boolean);
      if (ids.length === 0) fail('--target needs at least one target id');
      args.targetIds.push(...ids);
      index++;
    } else if (argument === '--timeout-seconds' && value) {
      args.timeoutSeconds = parsePositiveInteger(value, '--timeout-seconds');
      index++;
    } else if (argument === '--list-targets') {
      for (const target of TARGETS) console.log(`${target.id}\t${target.family}\t${target.label}`);
      process.exit(0);
    } else if (argument === '--help') {
      console.log(`Usage: node scripts/vfx-family-evidence.mjs [options]

Captures the P0/P3 VFX family matrix from real production-preview runs. Every
upgrade selection is a DOM button click; every screenshot waits for a public
driver event or immutable render snapshot. A target that does not naturally
occur writes BLOCKED evidence instead of fabricated proof.

  --target <ids>           Comma-separated matrix ids; defaults to every target.
  --list-targets           Print stable ids and exit.
  --iteration <name>       Output folder under docs/vfx/captures/.
  --seed <seed>            Fixed normal-run seed (default: 3).
  --timeout-seconds <n>    Override each target's normal real-time budget.
  --max-attempts <n>       Fresh real-run attempts per target (default: 1).
  --headed                 Require headed Chromium / hardware WebGL (default).
  --headless               SwiftShader fallback; report marks lower fidelity.
  --base-url <url>         Reuse an already-running production preview.
  --port <n>               Preview port when no --base-url is supplied.
  --allow-blocked          Exit zero after writing an incomplete report.

Typical focused commands:
  node scripts/vfx-family-evidence.mjs --target puffer-field,gecko-pad,skunk-cloud
  node scripts/vfx-family-evidence.mjs --target porcupine-quills,owl-pinions,thornstorm-mantle
  node scripts/vfx-family-evidence.mjs --target pickup-bomb,pickup-magnet,pickup-food --allow-blocked
`);
      process.exit(0);
    } else {
      fail(`unknown or incomplete argument: ${argument}`);
    }
  }
  args.iteration = normalizeIteration(args.iteration);
  return args;
}

function artifactPath(outputDirectory, absolutePath) {
  return relative(outputDirectory, absolutePath).split('\\').join('/');
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function sourceRevision() {
  try {
    const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspaceRoot, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: workspaceRoot, encoding: 'utf8' }).trim().length > 0;
    return { headSha, dirty };
  } catch {
    return { headSha: 'unavailable', dirty: null };
  }
}

function visualSourceProvenance() {
  // Keep this explicit rather than globbing the render directory. A matrix
  // capture is release evidence: a missing visual owner must fail loudly
  // instead of silently disappearing from the provenance record. The list
  // includes the shared P1/P3 texture-motion path and the P2/P4/P5/P6 owners
  // exercised by the family matrix, including their renderer-only helpers.
  const paths = [
    join(webToyRoot, 'scripts', 'vfx-family-evidence.mjs'),
    join(webToyRoot, 'src', 'presentation', 'combat-defense-presentation.ts'),
    join(webToyRoot, 'src', 'render', 'animated-vfx-atlas.ts'),
    join(webToyRoot, 'src', 'render', 'attack-vfx-palette.ts'),
    join(webToyRoot, 'src', 'render', 'camera-impact-shake.ts'),
    join(webToyRoot, 'src', 'render', 'combat-feedback-presentation.ts'),
    join(webToyRoot, 'src', 'render', 'illustrated-vfx-presentation.ts'),
    join(webToyRoot, 'src', 'render', 'illustrated-vfx-intensity-governor.ts'),
    join(webToyRoot, 'src', 'render', 'illustrated-vfx-motion.ts'),
    join(webToyRoot, 'src', 'render', 'illustrated-vfx-rank-profile.ts'),
    join(webToyRoot, 'src', 'render', 'trait-command-presentation.ts'),
    join(webToyRoot, 'src', 'render', 'persistent-zone-visual-presentation.ts'),
    join(webToyRoot, 'src', 'render', 'projectile-visual-truth.ts'),
    join(webToyRoot, 'src', 'render', 'projectile-signature-vfx-presentation.ts'),
    join(webToyRoot, 'src', 'render', 'loot-visual-presentation.ts'),
    join(webToyRoot, 'src', 'render', 'enemy-threat-presentation.ts'),
    join(webToyRoot, 'src', 'render', 'combat-impact-presentation.ts'),
    join(webToyRoot, 'src', 'render', 'impact-vfx-composite-presentation.ts'),
    join(webToyRoot, 'src', 'render', 'enemy-hit-flash-presentation.ts'),
    join(webToyRoot, 'src', 'render', 'signature-vfx-composite-presentation.ts'),
    join(webToyRoot, 'src', 'render', 'vfx-easing.ts'),
    join(webToyRoot, 'src', 'render', 'vfx-transform-store.ts'),
    join(webToyRoot, 'src', 'render', 'wildguard-vfx-atlas.ts'),
    join(webToyRoot, 'src', 'render', 'xp-visual-density-governor.ts'),
    join(webToyRoot, 'src', 'render', 'damage-number-presentation.ts'),
    join(webToyRoot, 'src', 'render', 'playcanvas-scene.ts'),
  ];
  return paths.map((path) => {
    if (!existsSync(path)) fail(`missing evidence provenance source: ${path}`);
    return Object.freeze({
      relativePath: relative(workspaceRoot, path).split('\\').join('/'),
      bytes: statSync(path).size,
      sha256: sha256File(path),
    });
  });
}

function runProcess(command, args, cwd = webToyRoot) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', rejectRun);
    child.once('close', (code) => {
      if (code === 0) resolveRun({ stderr });
      else rejectRun(new Error(`${command} exited ${String(code)}: ${stderr.slice(-4_000)}`));
    });
  });
}

async function startProductionPreview(port, source) {
  const buildStartedAt = new Date().toISOString();
  await runProcess('npm', ['run', 'build']);
  const buildCompletedAt = new Date().toISOString();
  const server = await preview({
    root: webToyRoot,
    logLevel: 'error',
    preview: { host: '127.0.0.1', port, strictPort: false },
  });
  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    await server.close();
    fail('Vite production preview did not expose a TCP port');
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => server.close(),
    build: { command: 'npm run build', source, buildStartedAt, buildCompletedAt },
    mode: 'production-preview',
  };
}

async function launchBrowser(mode) {
  if (mode === 'headless') {
    return {
      browser: await chromium.launch({
        headless: true,
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      }),
      mode: 'headless-swiftshader',
    };
  }
  return { browser: await chromium.launch({ headless: false }), mode: 'headed' };
}

function targetUrl(baseUrl, target, seed) {
  const url = new URL(baseUrl);
  url.searchParams.set('autopilot', '1');
  url.searchParams.set('hero', target.hero);
  url.searchParams.set('seed', seed);
  return url.toString();
}

async function pageRunState(page) {
  return page.evaluate(() => {
    const handle = window.__webToy;
    const canvas = document.getElementById('game-canvas');
    return {
      hasApp: handle !== undefined,
      tick: handle?.driver.tick ?? -1,
      webgl2: canvas?.getContext('webgl2') !== null,
      introHidden: document.getElementById('run-intro')?.hidden === true,
      rendererBanner: getComputedStyle(document.getElementById('ctx-banner') ?? document.body).display,
    };
  });
}

async function ensureRunStarted(page) {
  const running = () => page.waitForFunction(() => {
    const handle = window.__webToy;
    return handle !== undefined && handle.driver.tick > 3 && document.getElementById('run-intro')?.hidden === true;
  }, undefined, { timeout: 15_000 });
  try {
    await running();
    return { scriptedStartFallback: false, state: await pageRunState(page) };
  } catch {
    const start = page.locator('#run-intro:not([hidden]) #run-intro-start');
    if (await start.count() > 0) await start.click({ timeout: 1_000 });
    try {
      await running();
      return { scriptedStartFallback: true, state: await pageRunState(page) };
    } catch (error) {
      throw new FamilyEvidenceError(`game did not reach a rendered combat state: ${JSON.stringify(await pageRunState(page))}; ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Uses only actual DOM buttons.  The driver is read solely to find which
 * existing card is represented by which button; it is never asked to select a
 * card directly.  Fallbacks prefer neutral cards and safe sockets so a target
 * ingredient is not casually blocked before it appears in the real offer set.
 */
async function startUpgradeChooser(page, target) {
  await page.evaluate((requested) => {
    const state = { active: true, clicks: [], fusionClicks: 0, stoppedBecauseTargetMatched: false };
    const traitIds = requested.upgrade?.traits ?? [];
    const universalIds = requested.upgrade?.universals ?? [];
    const avoidTraits = requested.upgrade?.avoidTraits ?? [];
    const evolutionId = requested.upgrade?.evolutionId ?? null;
    const evolutionTitle = requested.upgrade?.evolutionTitle ?? null;

    function clickButton(button, detail) {
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      button.click();
      state.clicks.push(detail);
      return true;
    }

    function choose() {
      if (!state.active) return;
      const handle = window.__webToy;
      if (handle === undefined) {
        requestAnimationFrame(choose);
        return;
      }
      const primary = window.__familyVfxProbe?.state?.primary;
      if (primary !== null && primary !== undefined) {
        state.active = false;
        state.stoppedBecauseTargetMatched = true;
        return;
      }
      const root = document.getElementById('upgrade-choices');
      const offers = handle.driver.pendingUpgradeOffers ?? [];

      // A free fusion is player-visible in the same modal.  Prefer it before
      // the next queued level card once both real Master ingredients exist.
      const fusions = handle.driver.availableFusions ?? [];
      if (evolutionId !== null && fusions.some((fusion) => fusion.evolutionId === evolutionId) && root?.hidden === false) {
        const buttons = Array.from(root.querySelectorAll('button'));
        const button = buttons.find((candidate) => candidate.textContent?.includes(evolutionTitle ?? evolutionId));
        if (clickButton(button, { kind: 'fusion', evolutionId, tick: handle.driver.tick })) {
          state.fusionClicks++;
          requestAnimationFrame(choose);
          return;
        }
      }

      if (root?.hidden === false && offers.length > 0) {
        const buttons = Array.from(root.querySelectorAll('button')).slice(0, offers.length);
        const traitIndex = offers.findIndex((offer) => offer.kind === 'trait' && traitIds.includes(offer.traitId));
        const universalIndex = offers.findIndex((offer) => offer.kind === 'universal' && universalIds.includes(offer.upgradeId));
        const neutralIndex = offers.findIndex((offer) => offer.kind === 'universal');
        const safeTraitIndex = offers.findIndex((offer) => offer.kind === 'trait' && !avoidTraits.includes(offer.traitId));
        const index = traitIndex >= 0
          ? traitIndex
          : universalIndex >= 0
            ? universalIndex
            : neutralIndex >= 0
              ? neutralIndex
              : safeTraitIndex >= 0
                ? safeTraitIndex
                : 0;
        const offer = offers[index];
        const button = buttons[index];
        if (offer !== undefined && clickButton(button, {
          kind: offer.kind,
          id: offer.id,
          traitId: offer.kind === 'trait' ? offer.traitId : null,
          upgradeId: offer.kind === 'universal' ? offer.upgradeId : null,
          tick: handle.driver.tick,
          selectionReason: traitIndex === index ? 'target-trait'
            : universalIndex === index ? 'target-universal'
              : neutralIndex === index ? 'safe-neutral'
                : safeTraitIndex === index ? 'safe-trait'
                  : 'last-resort-visible-card',
        })) {
          requestAnimationFrame(choose);
          return;
        }
      }
      requestAnimationFrame(choose);
    }

    window.__familyVfxUpgradeChooser = {
      state,
      stop() { state.active = false; return JSON.parse(JSON.stringify(state)); },
    };
    requestAnimationFrame(choose);
  }, target);
  return {
    stop: () => page.evaluate(() => window.__familyVfxUpgradeChooser?.stop() ?? null),
  };
}

/**
 * Installs a page-owned observer after the app's own rAF loop.  It observes
 * only the documented public driver views.  In particular, it does not look
 * inside the renderer or use page-side command injections as a shortcut.
 */
async function installFamilyProbe(page, target) {
  await page.evaluate((requested) => {
    const state = {
      status: 'waiting-primary',
      primary: null,
      secondary: null,
      phases: [],
      pendingPhase: null,
      error: null,
      startedAtTick: window.__webToy?.driver.tick ?? null,
      runOutcome: null,
    };
    let stopped = false;
    let phaseIndex = 0;

    function equals(actual, expected) {
      if (expected === undefined || expected === null) return true;
      return Array.isArray(expected) ? expected.includes(actual) : actual === expected;
    }

    function compactEvent(stream, event) {
      if (stream === 'trait') {
        return {
          stream,
          kind: event.kind,
          sourceId: event.sourceId,
          tag: event.tag ?? '',
          tick: event.tick,
          x: event.originX,
          y: event.originY,
          dirX: event.dirX,
          dirY: event.dirY,
          count: event.count,
          radius: event.radius,
          durationTicks: event.durationTicks,
          resolvedHitCount: event.resolvedHitCount,
          resolvedOrbitHitCount: event.resolvedOrbitHitCount,
          meleeArcResolved: event.meleeArcResolved,
        };
      }
      if (stream === 'combat') {
        return {
          stream,
          kind: event.kind,
          sourceId: event.sourceId,
          pickupKind: event.pickupKind ?? '',
          tick: event.tick,
          amount: event.amount,
          critical: event.critical,
          targetId: event.targetId,
          x: event.x,
          y: event.y,
        };
      }
      return {
        stream,
        kind: event.kind,
        tick: event.tick,
        seq: event.seq,
        phase: event.phase ?? null,
      };
    }

    function eventMatches(event, predicate) {
      return equals(event.kind, predicate.kinds ?? predicate.kind)
        && equals(event.sourceId, predicate.sourceIds ?? predicate.sourceId)
        && equals(event.tag, predicate.tags ?? predicate.tag)
        && equals(event.pickupKind, predicate.pickupKinds ?? predicate.pickupKind)
        && (predicate.critical === undefined || event.critical === predicate.critical)
        && (predicate.minimumResolvedHitCount === undefined || event.resolvedHitCount >= predicate.minimumResolvedHitCount);
    }

    function currentEvents(handle, stream) {
      if (stream === 'trait') return handle.driver.traitPresentationEvents ?? [];
      if (stream === 'combat') return handle.driver.combatPresentationEvents ?? [];
      return handle.driver.directorEvents ?? [];
    }

    function findLiveEvent(handle, predicate, minimumTick) {
      const stream = predicate.stream;
      const events = currentEvents(handle, stream);
      for (const event of events) {
        if (event.tick !== handle.driver.tick || event.tick < minimumTick) continue;
        if (eventMatches(event, predicate)) return compactEvent(stream, event);
      }
      return null;
    }

    function snapshotCandidate(handle, predicate) {
      const snapshot = handle.driver.curr?.[predicate.category];
      if (snapshot === undefined || snapshot.count < (predicate.minimumCount ?? 1)) return null;
      for (let index = 0; index < snapshot.count; index++) {
        const id = snapshot.id[index];
        const role = snapshot.role[index];
        const source = snapshot.source[index];
        const critical = snapshot.critical[index] === 1;
        if (!equals(role, predicate.roles ?? predicate.role)) continue;
        if (!equals(source, predicate.sources ?? predicate.source)) continue;
        if (predicate.critical !== undefined && critical !== predicate.critical) continue;
        if (predicate.chargerWindup === true) {
          // Mirror the published renderer policy: charger role 4, a 24-tick
          // stationary wind-up in its 180-tick cycle, id-seeded phase.
          const phase = ((handle.driver.tick + (id & 31)) % 180 + 180) % 180;
          if (role !== 4 || phase >= 24) continue;
        }
        return {
          stream: 'snapshot',
          category: predicate.category,
          tick: handle.driver.tick,
          playerXp: handle.driver.curr.playerXp,
          id,
          index,
          x: snapshot.x[index],
          y: snapshot.y[index],
          radius: snapshot.radius[index],
          value: snapshot.value[index],
          role,
          source,
          critical,
        };
      }
      return null;
    }

    function findPrimary(handle) {
      const candidate = requested.primary.type === 'snapshot'
        ? snapshotCandidate(handle, requested.primary)
        : findLiveEvent(handle, requested.primary, handle.driver.tick);
      if (candidate === null) return null;
      const requiredSelection = requested.primary.requiresSelectedId;
      if (requiredSelection === undefined) return candidate;
      const selections = window.__familyVfxUpgradeChooser?.state?.clicks ?? [];
      return selections.some((selection) => selection.id === requiredSelection) ? candidate : null;
    }

    function isNearPrimary(candidate, predicate) {
      if (predicate.nearPrimary !== true || state.primary === null) return true;
      const primaryX = Number(state.primary.x);
      const primaryY = Number(state.primary.y);
      const candidateX = Number(candidate.x);
      const candidateY = Number(candidate.y);
      if (!Number.isFinite(primaryX) || !Number.isFinite(primaryY)
        || !Number.isFinite(candidateX) || !Number.isFinite(candidateY)) return false;
      const maximum = Number.isFinite(predicate.nearPrimaryDistance)
        ? Math.max(0, predicate.nearPrimaryDistance)
        : Math.max(12, Number(state.primary.radius) || 0, Number(candidate.radius) || 0);
      return Math.hypot(candidateX - primaryX, candidateY - primaryY) <= maximum;
    }

    function primarySnapshotStillLive(handle) {
      if (state.primary?.stream !== 'snapshot') return true;
      const snapshot = handle.driver.curr?.[state.primary.category];
      if (snapshot === undefined) return false;
      for (let index = 0; index < snapshot.count; index++) {
        if (snapshot.id[index] === state.primary.id) return true;
      }
      return false;
    }

    function findSecondary(handle) {
      const predicate = requested.secondary;
      if (predicate === undefined || state.primary === null) return null;
      const minimumTick = state.primary.tick + (predicate.minimumTickDelta ?? 0);
      if (handle.driver.tick < minimumTick) return null;
      if (predicate.type === 'snapshot') {
        const snapshot = snapshotCandidate(handle, predicate);
        return snapshot !== null && isNearPrimary(snapshot, predicate) ? snapshot : null;
      }
      if (predicate.type === 'snapshotMissing') {
        const category = predicate.category ?? state.primary.category;
        const snapshot = handle.driver.curr?.[category];
        if (snapshot === undefined) return null;
        for (let index = 0; index < snapshot.count; index++) {
          if (snapshot.id[index] === state.primary.id) return null;
        }
        const playerXpBefore = Number(state.primary.playerXp);
        const playerXpAfter = Number(handle.driver.curr.playerXp);
        if (predicate.requiresPlayerXpGain === true
          && (!(Number.isFinite(playerXpBefore) && Number.isFinite(playerXpAfter)) || playerXpAfter <= playerXpBefore)) {
          return null;
        }
        return {
          stream: 'snapshotMissing', category, tick: handle.driver.tick, id: state.primary.id,
          playerXpBefore: Number.isFinite(playerXpBefore) ? playerXpBefore : null,
          playerXpAfter: Number.isFinite(playerXpAfter) ? playerXpAfter : null,
        };
      }
      const event = findLiveEvent(handle, predicate, minimumTick);
      return event !== null && isNearPrimary(event, predicate) ? event : null;
    }

    function armNextPhase() {
      if (state.primary === null) return;
      const phase = requested.phases[phaseIndex];
      if (phase === undefined) {
        state.status = requested.secondary === undefined ? 'complete' : 'waiting-secondary';
        return;
      }
      const waitForPhase = () => {
        if (stopped || state.status === 'error') return;
        const handle = window.__webToy;
        if (handle === undefined || state.primary === null) {
          state.status = 'error';
          state.error = 'public app handle disappeared before phase capture';
          return;
        }
        const delta = handle.driver.tick - state.primary.tick;
        const maximum = phase.maximumTickDelta ?? phase.tickDelta + 2;
        if (delta > maximum) {
          state.status = 'error';
          state.error = `missed ${phase.label} phase: wanted Δ${String(phase.tickDelta)}, observed Δ${String(delta)}`;
          return;
        }
        if (delta < phase.tickDelta) {
          requestAnimationFrame(waitForPhase);
          return;
        }
        handle.controls.paused = true;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const pausedTick = window.__webToy?.driver.tick ?? null;
          const pausedDelta = Number(pausedTick) - state.primary.tick;
          if (!Number.isSafeInteger(pausedTick) || pausedDelta < phase.tickDelta || pausedDelta > maximum) {
            state.status = 'error';
            state.error = `phase hold landed outside ${phase.label}: Δ${String(pausedDelta)}`;
            return;
          }
          if (!primarySnapshotStillLive(handle)) {
            state.status = 'error';
            state.error = `primary snapshot ${String(state.primary.id)} despawned before ${phase.label} compositor evidence`;
            return;
          }
          const needsPhaseSnapshot = requested.phaseSnapshot !== undefined
            && (requested.phaseSnapshot.labels.length === 0 || requested.phaseSnapshot.labels.includes(phase.label));
          const phaseSnapshot = needsPhaseSnapshot ? snapshotCandidate(handle, requested.phaseSnapshot) : null;
          if (needsPhaseSnapshot && (phaseSnapshot === null || !isNearPrimary(phaseSnapshot, requested.phaseSnapshot))) {
            state.status = 'error';
            state.error = `no live ${requested.phaseSnapshot.category} snapshot matched ${phase.label} evidence`;
            return;
          }
          state.pendingPhase = {
            label: phase.label,
            requestedTickDelta: phase.tickDelta,
            maximumTickDelta: maximum,
            pausedAtTick: pausedTick,
            pausedAtDelta: pausedDelta,
            phaseSnapshot,
          };
          state.status = 'phase-ready';
        }));
      };
      // Snapshot-backed targets (ground pickups and already-live hazards)
      // need a truthful Δ0 compositor hold before the next simulation frame
      // can collect or despawn the exact observed entity.
      if (phase.tickDelta === 0) waitForPhase();
      else requestAnimationFrame(waitForPhase);
    }

    function watch() {
      if (stopped) return;
      const handle = window.__webToy;
      if (handle === undefined) {
        requestAnimationFrame(watch);
        return;
      }
      if (handle.driver.runOutcome === 'defeat' || handle.driver.runOutcome === 'victory') {
        state.runOutcome = handle.driver.runOutcome;
        if (state.status === 'waiting-primary' || state.status === 'waiting-secondary') {
          state.status = 'error';
          state.error = `run ended (${handle.driver.runOutcome}) before target completed`;
          return;
        }
      }
      if (state.status === 'waiting-primary') {
        const primary = findPrimary(handle);
        if (primary !== null) {
          state.primary = primary;
          state.status = 'matched';
          armNextPhase();
        }
      } else if (state.status === 'waiting-secondary') {
        const secondary = findSecondary(handle);
        if (secondary !== null) {
          state.secondary = secondary;
          state.status = 'complete';
        }
      }
      requestAnimationFrame(watch);
    }

    window.__familyVfxProbe = {
      state,
      completePhase(observedAfterScreenshotTick) {
        if (state.status !== 'phase-ready' || state.pendingPhase === null || state.primary === null) return false;
        const handle = window.__webToy;
        const observedTick = Number.isSafeInteger(observedAfterScreenshotTick)
          ? observedAfterScreenshotTick
          : handle?.driver.tick ?? state.pendingPhase.pausedAtTick;
        state.phases.push({
          ...state.pendingPhase,
          observedAfterScreenshotTick: observedTick,
          observedAfterScreenshotDelta: observedTick - state.primary.tick,
        });
        state.pendingPhase = null;
        phaseIndex++;
        if (handle !== undefined) handle.controls.paused = false;
        state.status = 'matched';
        armNextPhase();
        return true;
      },
      stop() {
        const handle = window.__webToy;
        if (handle !== undefined) handle.controls.paused = false;
        stopped = true;
      },
    };
    requestAnimationFrame(watch);
  }, target);
}

async function probeState(page) {
  return page.evaluate(() => {
    const state = window.__familyVfxProbe?.state;
    return state === undefined ? null : JSON.parse(JSON.stringify(state));
  });
}

async function awaitProbeChange(page, timeoutMs) {
  await page.waitForFunction(() => {
    const status = window.__familyVfxProbe?.state?.status;
    return status === 'phase-ready' || status === 'complete' || status === 'error';
  }, undefined, { timeout: timeoutMs });
  const state = await probeState(page);
  if (state === null) fail('family probe disappeared before reporting state');
  return state;
}

async function writeGrayCopy(sourcePath, destinationPath) {
  const image = await loadImage(sourcePath);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const luminance = Math.round(
      pixels.data[index] * 0.2126 + pixels.data[index + 1] * 0.7152 + pixels.data[index + 2] * 0.0722,
    );
    pixels.data[index] = luminance;
    pixels.data[index + 1] = luminance;
    pixels.data[index + 2] = luminance;
  }
  context.putImageData(pixels, 0, 0);
  writeFileSync(destinationPath, canvas.toBuffer('image/png'));
}

function safeFilePart(value) {
  return value.replace(/[^a-z0-9_-]/giu, '-').replace(/-+/gu, '-').replace(/^-|-$/gu, '');
}

async function captureTarget(browser, baseUrl, target, args, outputDirectory) {
  const targetDirectory = join(outputDirectory, target.id);
  mkdirSync(targetDirectory, { recursive: true });
  const attempts = [];
  const timeoutSeconds = args.timeoutSeconds ?? target.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;

  for (let attempt = 1; attempt <= args.maxAttempts; attempt++) {
    const attemptDirectory = args.maxAttempts === 1
      ? targetDirectory
      : join(targetDirectory, `attempt-${String(attempt).padStart(2, '0')}`);
    mkdirSync(attemptDirectory, { recursive: true });
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    let chooser = null;
    try {
      await page.goto(targetUrl(baseUrl, target, args.seed), { waitUntil: 'networkidle', timeout: 30_000 });
      const started = await ensureRunStarted(page);
      await installFamilyProbe(page, target);
      chooser = await startUpgradeChooser(page, target);
      const deadline = Date.now() + timeoutSeconds * 1_000;
      const screenshots = [];
      let finalState = null;
      while (Date.now() < deadline) {
        const remainingMs = Math.max(250, deadline - Date.now());
        let state;
        try {
          state = await awaitProbeChange(page, Math.min(1_500, remainingMs));
        } catch {
          if (Date.now() >= deadline) break;
          continue;
        }
        finalState = state;
        if (state.status === 'phase-ready') {
          const phase = state.pendingPhase;
          const ordinal = String((state.phases?.length ?? 0) + 1).padStart(2, '0');
          const label = safeFilePart(phase?.label ?? `phase-${ordinal}`);
          const colorPath = join(attemptDirectory, `phase-${ordinal}-${label}-t${String(phase?.pausedAtTick ?? 'unknown')}.png`);
          const grayPath = colorPath.replace(/\.png$/u, '-gray.png');
          await page.screenshot({ path: colorPath });
          await writeGrayCopy(colorPath, grayPath);
          const observedTick = await page.evaluate(() => window.__webToy?.driver.tick ?? null);
          const completed = await page.evaluate((tick) => window.__familyVfxProbe?.completePhase(tick) ?? false, observedTick);
          if (!completed) fail(`${target.id} phase was no longer ready when screenshot completed`);
          screenshots.push({
            color: artifactPath(outputDirectory, colorPath),
            grayscale: artifactPath(outputDirectory, grayPath),
            phase,
          });
          continue;
        }
        if (state.status === 'complete' || state.status === 'error') break;
      }
      finalState = await probeState(page) ?? finalState;
      const chooserState = chooser === null ? null : await chooser.stop();
      await page.evaluate(() => window.__familyVfxProbe?.stop());
      const complete = finalState?.status === 'complete';
      const result = {
        attempt,
        status: complete ? 'PASS' : 'BLOCKED',
        started,
        timeoutSeconds,
        target: {
          id: target.id,
          label: target.label,
          family: target.family,
          primaryPredicate: target.primary,
          secondaryPredicate: target.secondary ?? null,
          phaseSnapshotPredicate: target.phaseSnapshot ?? null,
        },
        primary: finalState?.primary ?? null,
        secondary: finalState?.secondary ?? null,
        phases: finalState?.phases ?? [],
        screenshots,
        chooser: chooserState,
        probeStatus: finalState?.status ?? 'timed-out',
        blocker: complete ? null : finalState?.error ?? `no authentic target completion in ${String(timeoutSeconds)}s`,
        consoleErrors,
      };
      attempts.push(result);
      if (complete) {
        await context.close();
        return { ...result, attempts };
      }
    } catch (error) {
      const chooserState = chooser === null ? null : await chooser.stop().catch(() => null);
      await page.evaluate(() => window.__familyVfxProbe?.stop()).catch(() => undefined);
      attempts.push({
        attempt,
        status: 'BLOCKED',
        timeoutSeconds,
        target: {
          id: target.id,
          label: target.label,
          family: target.family,
          primaryPredicate: target.primary,
          secondaryPredicate: target.secondary ?? null,
          phaseSnapshotPredicate: target.phaseSnapshot ?? null,
        },
        primary: null,
        secondary: null,
        phases: [],
        screenshots: [],
        chooser: chooserState,
        probeStatus: 'exception',
        blocker: error instanceof Error ? error.message : String(error),
        consoleErrors,
      });
    } finally {
      await context.close().catch(() => undefined);
    }
  }
  const last = attempts.at(-1);
  return { ...last, attempts };
}

function reportMarkdown(report) {
  const lines = [
    '# VFX Family Evidence Matrix',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Run mode: ${report.captureContract.runMode}`,
    `- Browser: ${report.browser.mode}`,
    `- Seed: \`${report.seed}\``,
    `- Result: **${report.pass ? 'PASS' : 'BLOCKED'}** (${report.targets.filter((target) => target.status === 'PASS').length}/${report.targets.length} complete)`,
    '',
    '## Capture contract',
    '',
    '- Every target started from a normal autoplay run and used only player-visible DOM upgrade/fusion button clicks.',
    '- Primary predicates read actual current-tick public driver events or immutable driver snapshots; the harness never inserts simulation or renderer events.',
    '- Phase screenshots briefly pause the public presentation control after a live event. They are exact compositor still evidence, not a false continuous-motion recording.',
    '- `BLOCKED` means the real run did not produce the requested target within its recorded budget; it is not a pass and has no substitute screenshot.',
    '',
    '## Matrix',
    '',
    '| Target | Family | Result | Primary proof | Secondary/lifecycle |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const target of report.targets) {
    const primary = target.primary === null || target.primary === undefined
      ? '—'
      : `${target.primary.stream}:${target.primary.kind ?? target.primary.category}@t${target.primary.tick}`;
    const secondary = target.secondary === null || target.secondary === undefined
      ? (target.status === 'PASS' ? 'not required' : target.blocker ?? '—')
      : `${target.secondary.stream}:${target.secondary.kind ?? target.secondary.category}@t${target.secondary.tick}`;
    lines.push(`| ${target.target.id} | ${target.target.family} | ${target.status} | ${primary} | ${secondary} |`);
  }
  lines.push('', 'See `report.json` for phase tick deltas, screenshots, chosen visible cards, source hashes, and all blocked reasons.');
  return `${lines.join('\n')}\n`;
}

function blockedMarkdown(report) {
  const blocked = report.targets.filter((target) => target.status !== 'PASS');
  if (blocked.length === 0) return null;
  const lines = [
    '# BLOCKED — VFX Family Evidence Matrix',
    '',
    'These targets were not marked complete. The harness did not fabricate an event or use a renderer injection.',
    '',
  ];
  for (const target of blocked) {
    lines.push(`- **${target.target.id}** — ${target.blocker ?? 'no recorded completion'}`);
  }
  lines.push('', 'Retry a focused target with a different real seed or a longer `--timeout-seconds`; preserve this file until an authentic replacement capture exists.');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targets = selectedTargets([...new Set(args.targetIds)]);
  const outputDirectory = join(capturesRoot, args.iteration);
  if (existsSync(outputDirectory)) fail(`output directory already exists: ${outputDirectory}`);
  mkdirSync(outputDirectory, { recursive: true });

  const source = { ...sourceRevision(), visualSources: visualSourceProvenance() };
  let server = null;
  let browserRecord = null;
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    seed: args.seed,
    command: `node scripts/vfx-family-evidence.mjs --iteration ${args.iteration} --seed ${args.seed}${args.targetIds.length > 0 ? ` --target ${args.targetIds.join(',')}` : ''}`,
    captureContract: {
      runMode: 'normal-autopilot with real DOM upgrade and fusion selections',
      targetAuthentication: 'public driver current-tick events and immutable snapshots only',
      phaseStills: 'post-event public-controls pause; still provenance only, not continuous-motion evidence',
      noInjection: true,
      ticksPerSecond: NORMAL_SPEED_TICKS_PER_SECOND,
    },
    source,
    build: null,
    browser: null,
    targets: [],
    pass: false,
  };

  try {
    server = args.baseUrl === null
      ? await startProductionPreview(args.port, source)
      : { baseUrl: args.baseUrl, close: async () => undefined, build: { command: 'external-base-url', source }, mode: 'external-base-url' };
    report.build = server.build;
    const launched = await launchBrowser(args.browserMode);
    browserRecord = launched;
    report.browser = { mode: launched.mode };
    for (const target of targets) {
      console.log(`[vfx-family-evidence] capturing ${target.id}`);
      const result = await captureTarget(launched.browser, server.baseUrl, target, args, outputDirectory);
      report.targets.push(result);
      console.log(`[vfx-family-evidence] ${target.id}: ${result.status}`);
    }
  } catch (error) {
    report.targets.push({
      status: 'BLOCKED',
      target: { id: 'harness', label: 'Harness startup', family: 'infrastructure' },
      primary: null,
      secondary: null,
      phases: [],
      screenshots: [],
      blocker: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (browserRecord !== null) await browserRecord.browser.close().catch(() => undefined);
    if (server !== null) await server.close().catch(() => undefined);
  }

  report.pass = report.targets.length === targets.length && report.targets.every((target) => target.status === 'PASS');
  writeFileSync(join(outputDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(outputDirectory, 'README.md'), reportMarkdown(report));
  const blocked = blockedMarkdown(report);
  if (blocked !== null) writeFileSync(join(outputDirectory, 'BLOCKED.md'), blocked);
  console.log(`[vfx-family-evidence] wrote ${join(outputDirectory, 'report.json')}`);
  if (!report.pass && !args.allowBlocked) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
