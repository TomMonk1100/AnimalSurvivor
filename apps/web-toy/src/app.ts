/**
 * LEAD-OWNED integration. Wires the frozen swarm modules into one runnable
 * shell WITHOUT letting rendering, frame rate, or input devices change gameplay
 * state. The simulation (via the fixed-tick driver) is authoritative; everything
 * here only reads sim state through app-owned snapshots and diagnostics.
 *
 * Boundary map:
 *   Agent A  createSimDriver / snapshots / interpolation  (authoritative stepping)
 *   Agent B  createRenderer  (RendererAdapter — the only path to the GPU)
 *   Agent C  createInputController / createAutopilot / perf monitor / HUD
 *   contracts.ts  the frozen interfaces between them
 */
import { DEFAULT_CONFIG } from '@sim';
import type { RunDirectorFactory, SimConfig, TraitRuntimeFactory } from '@sim';
import { GREG_VERTICAL_SLICE_CATALOG, TraitRuntime } from '@traits';
import { RunDirector } from '@director';
import type { HudStats, InputSource } from './contracts';
import { createSimDriver, MAX_CATCHUP_TICKS, type SimDriver } from './sim/simulation-driver';
import { createRenderer } from './render/playcanvas-scene';
import { createInputController } from './input/input-controller';
import { createAutopilot } from './stress/autopilot';
import { createRenderStressHarness } from './stress/render-stress-snapshots';
import { createPerformanceMonitor } from './diagnostics/performance-monitor';
import { createHud } from './diagnostics/debug-hud';
import type { RendererAdapter } from './contracts';
import { projectDirectorEvent, type DirectorNotice } from './presentation/director-notices';

/** Deterministic 32-bit seed from a string (djb2). Used only for UI convenience. */
function seedFromString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

interface Controls {
  paused: boolean;
  autopilotOn: boolean;
  renderEnabled: boolean;
}

export interface AppHandle {
  stop(): void;
  /** Exposed for the browser acceptance harness / console. */
  readonly driver: SimDriver;
  readonly controls: Controls;
}

const HUD_INTERVAL_MS = 250;
const RESOLUTION_NOTE = 'local hardware evidence — not a universal pass threshold';
const traitRuntimeFactory: TraitRuntimeFactory = ({ seed, initialTick }) =>
  new TraitRuntime({ seed, initialTick, catalog: GREG_VERTICAL_SLICE_CATALOG });
const runDirectorFactory: RunDirectorFactory = ({ seed }) => new RunDirector({ seed });

function displayTraitName(traitId: string): string {
  return traitId
    .split('-')
    .map((part) => part.length === 0 ? part : part[0]!.toUpperCase() + part.slice(1))
    .join(' ');
}

function describeUpgrade(traitId: string, stage: 'bud' | 'adapted'): string {
  if (traitId === 'porcupine-quills') {
    return stage === 'bud'
      ? 'Automatically fires a compact quill burst at nearby enemies.'
      : 'Fires more quills, faster. Combines with Adapted Puffer Pouch into Thornstorm.';
  }
  if (traitId === 'puffer-pouch') {
    return stage === 'bud'
      ? 'Periodically pulls nearby enemies toward Greg.'
      : 'Becomes a wider knockback pulse. Combines with Adapted Quills into Thornstorm.';
  }
  return stage === 'bud' ? 'Adds a new visible animal adaptation.' : 'Strengthens this adaptation.';
}

export function startApp(config: SimConfig = DEFAULT_CONFIG): AppHandle {
  const params = new URLSearchParams(window.location.search);
  const stressMode = params.get('stress') === '1';
  const renderStressMode = params.get('renderstress') === '1';
  const stressStopTicks = config.hz * 60 * 5;
  const seedParam = params.get('seed');
  const initialSeed = seedParam
    ? /^\d+$/.test(seedParam)
      ? Number(seedParam) >>> 0
      : seedFromString(seedParam)
    : 0x1234abcd;

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const surface = document.getElementById('game-surface') as HTMLElement;
  const joystickZone = document.getElementById('joystick') as HTMLElement;
  const hudRoot = document.getElementById('hud') as HTMLElement;
  const controlsRoot = document.getElementById('controls') as HTMLElement;
  const ctxBanner = document.getElementById('ctx-banner') as HTMLElement;
  const upgradeRoot = document.getElementById('upgrade-choices') as HTMLElement;
  const outcomeRoot = document.getElementById('run-outcome') as HTMLElement;
  const directorRoot = document.getElementById('director-notice') as HTMLElement;

  const driver: SimDriver = createSimDriver(config, initialSeed, {
    traitRuntimeFactory,
    runDirectorFactory,
  });
  const renderStress = renderStressMode ? createRenderStressHarness(config) : null;
  const renderer: RendererAdapter = createRenderer(canvas, config);
  const perf = createPerformanceMonitor();
  const hud = createHud(hudRoot);

  const keyboardInput: InputSource = createInputController({ surface, joystickZone });
  const autopilot: InputSource = createAutopilot();

  const controls: Controls = {
    paused: false,
    autopilotOn: params.get('autopilot') === '1',
    renderEnabled: true,
  };
  let currentSeed = initialSeed;
  let syntheticDriverNow = performance.now();
  let renderedOfferKey = '';
  let activeDirectorNotice: DirectorNotice | null = null;
  let renderedDirectorKey = '';

  function renderDirectorNotice(): void {
    for (const event of driver.directorEvents) {
      const projected = projectDirectorEvent(event);
      if (projected !== null && projected.expiresAtTick !== null) activeDirectorNotice = projected;
    }
    if (activeDirectorNotice?.expiresAtTick !== null && activeDirectorNotice !== null
      && driver.tick >= activeDirectorNotice.expiresAtTick) activeDirectorNotice = null;
    const key = activeDirectorNotice?.key ?? '';
    if (key === renderedDirectorKey) return;
    renderedDirectorKey = key;
    directorRoot.replaceChildren();
    directorRoot.hidden = activeDirectorNotice === null;
    if (activeDirectorNotice === null) return;
    directorRoot.dataset.tone = activeDirectorNotice.tone;
    const title = document.createElement('strong');
    title.textContent = activeDirectorNotice.title;
    const detail = document.createElement('span');
    detail.textContent = activeDirectorNotice.detail;
    directorRoot.append(title, detail);
  }

  function renderUpgradeChoices(): void {
    const offers = driver.pendingUpgradeOffers;
    const key = offers.map((offer) => `${offer.traitId}:${offer.resultStage}`).join('|');
    if (key === renderedOfferKey && upgradeRoot.hidden === !driver.upgradeSelectionPending) return;
    renderedOfferKey = key;
    upgradeRoot.replaceChildren();
    upgradeRoot.hidden = !driver.upgradeSelectionPending;
    if (!driver.upgradeSelectionPending) return;

    const heading = document.createElement('h2');
    heading.textContent = 'Choose an animal adaptation';
    upgradeRoot.appendChild(heading);
    for (const offer of offers) {
      const choice = document.createElement('button');
      choice.type = 'button';
      const title = document.createElement('strong');
      title.textContent = `${displayTraitName(offer.traitId)} — ${offer.resultStage === 'bud' ? 'NEW' : 'UPGRADE'}`;
      const description = document.createElement('span');
      description.textContent = describeUpgrade(offer.traitId, offer.resultStage);
      choice.append(title, description);
      choice.addEventListener('click', () => {
        driver.selectUpgrade(offer.traitId);
        activeInput().clear();
        driver.noteVisible(syntheticDriverNow);
        renderedOfferKey = '';
        renderUpgradeChoices();
      });
      upgradeRoot.appendChild(choice);
    }
  }

  function renderRunOutcome(): void {
    const outcome = driver.runOutcome;
    outcomeRoot.hidden = outcome === null || outcome === 'running';
    if (outcome === 'victory') {
      outcomeRoot.dataset.outcome = 'victory';
      outcomeRoot.textContent = 'Run complete — Greg survives!';
    } else if (outcome === 'defeat') {
      outcomeRoot.dataset.outcome = 'defeat';
      outcomeRoot.textContent = 'Greg was overwhelmed — return stronger and try again';
    }
  }

  // ---- controls UI (built once; no per-frame DOM creation) ----------------
  function button(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', onClick);
    controlsRoot.appendChild(b);
    return b;
  }
  const pauseBtn = button('Pause', () => setPaused(!controls.paused));
  const autoBtn = button(controls.autopilotOn ? 'Autopilot: ON' : 'Autopilot: OFF', () => {
    controls.autopilotOn = !controls.autopilotOn;
    autoBtn.textContent = controls.autopilotOn ? 'Autopilot: ON' : 'Autopilot: OFF';
    activeInput().clear();
  });
  const renderBtn = button('Renderer: ON', () => {
    controls.renderEnabled = !controls.renderEnabled;
    renderBtn.textContent = controls.renderEnabled ? 'Renderer: ON' : 'Renderer: OFF';
  });
  const seedInput = document.createElement('input');
  seedInput.type = 'text';
  seedInput.value = String(currentSeed);
  seedInput.size = 10;
  seedInput.style.cssText = 'font:inherit;background:#0f151f;color:#d7e0ea;border:1px solid #33415a;border-radius:5px;padding:5px;';
  controlsRoot.appendChild(seedInput);
  button('Restart w/ seed', () => {
    const raw = seedInput.value.trim();
    currentSeed = /^\d+$/.test(raw) ? Number(raw) >>> 0 : seedFromString(raw);
    seedInput.value = String(currentSeed);
    driver.restart(currentSeed);
    activeDirectorNotice = null;
    renderedDirectorKey = '';
    renderedOfferKey = '';
    renderUpgradeChoices();
    renderRunOutcome();
    syntheticDriverNow = performance.now();
    keyboardInput.clear();
    perf.reset();
    setPaused(false);
  });

  function setPaused(p: boolean): void {
    controls.paused = p;
    pauseBtn.textContent = p ? 'Resume' : 'Pause';
    if (p) activeInput().clear();
  }

  function activeInput(): InputSource {
    return controls.autopilotOn ? autopilot : keyboardInput;
  }

  // ---- lifecycle listeners -------------------------------------------------
  const onResize = (): void => renderer.resize();
  window.addEventListener('resize', onResize);

  const onBlur = (): void => {
    keyboardInput.clear();
  };
  window.addEventListener('blur', onBlur);

  const onVisibility = (): void => {
    if (document.visibilityState === 'visible') {
      // Prevent a hidden-tab catch-up burst on return.
      driver.noteVisible(stressMode ? syntheticDriverNow : performance.now());
    } else {
      keyboardInput.clear();
    }
  };
  document.addEventListener('visibilitychange', onVisibility);

  renderer.resize();

  // ---- main loop -----------------------------------------------------------
  let raf = 0;
  let running = true;
  let lastFrameStart: number | null = null;
  let lastHudAt = 0;
  let cachedHash = driver.hash();

  function frame(now: number): void {
    if (!running) return;
    raf = requestAnimationFrame(frame);

    const frameTimeMs = lastFrameStart === null ? 0 : Math.max(0, now - lastFrameStart);
    lastFrameStart = now;

    const rendererLost = renderer.stats().contextLost === 1;
    // While the GPU context is lost we visibly halt gameplay so the loss can
    // never silently desync or corrupt sim state; sim resumes on restore.
    const runEnded = driver.runOutcome !== null && driver.runOutcome !== 'running';
    const effectivePaused = controls.paused || rendererLost || driver.upgradeSelectionPending || runEnded;

    // Stress mode deliberately advances five fixed ticks per rendered frame so
    // high-load browser evidence can be gathered in roughly one fifth of real
    // time. Inputs remain pure functions of sim tick and gameplay still steps
    // only through the same capped fixed-tick accumulator.
    if (stressMode && !effectivePaused) {
      syntheticDriverNow += (1000 / config.hz) * MAX_CATCHUP_TICKS;
    } else if (!stressMode) {
      syntheticDriverNow = now;
    }
    driver.frame(syntheticDriverNow, activeInput(), effectivePaused);
    if (stressMode && driver.upgradeSelectionPending) {
      const firstOffer = driver.pendingUpgradeOffers[0];
      if (firstOffer !== undefined) driver.selectUpgrade(firstOffer.traitId);
    }
    renderUpgradeChoices();
    renderDirectorNotice();
    renderRunOutcome();
    if (stressMode && driver.tick >= stressStopTicks && !controls.paused) {
      setPaused(true);
    }

    if (controls.renderEnabled && renderer.ready && !rendererLost) {
      if (renderStress !== null) renderStress.update(driver.tick);
      renderer.render(
        renderStress?.prev ?? driver.prev,
        renderStress?.curr ?? driver.curr,
        driver.alpha,
        driver.traitVisualState(),
      );
    }

    perf.frame(frameTimeMs);
    ctxBanner.style.display = rendererLost ? 'block' : 'none';

    if (now - lastHudAt >= HUD_INTERVAL_MS) {
      lastHudAt = now;
      cachedHash = driver.hash();
      const rs = renderer.stats();
      const [, frameP95Ms, frameP99Ms] = perf.percentiles();
      const stats: HudStats = {
        fps: perf.fps,
        frameTimeMs: perf.frameTimeMs,
        frameP95Ms,
        frameP99Ms,
        simTick: driver.tick,
        ticksLastFrame: driver.ticksLastFrame,
        droppedAccumSec: driver.droppedAccumSec,
        enemiesLive: renderStress?.enemies ?? driver.enemiesLive,
        enemiesHigh: renderStress?.enemies ?? driver.enemiesHigh,
        projLive: renderStress?.projectiles ?? driver.projLive,
        projHigh: renderStress?.projectiles ?? driver.projHigh,
        pickupsLive: renderStress?.pickups ?? driver.pickupsLive,
        pickupsHigh: renderStress?.pickups ?? driver.pickupsHigh,
        drawCalls: controls.renderEnabled ? rs.drawCalls : 0,
        stateHash: cachedHash,
        paused: effectivePaused,
        autopilot: controls.autopilotOn,
      };
      hud.update(stats);
    }
  }
  raf = requestAnimationFrame(frame);

  function stop(): void {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibility);
    keyboardInput.dispose();
    autopilot.dispose();
    renderer.dispose();
    hud.dispose();
  }

  // Console-visible note so stress evidence is never mistaken for a threshold.
  console.info(`[web-toy] running. Frame-time/draw-call figures are ${RESOLUTION_NOTE}.`);

  return { stop, driver, controls };
}
