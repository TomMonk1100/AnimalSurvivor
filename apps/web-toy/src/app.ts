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
import { DEFAULT_CONFIG, UNIVERSAL_UPGRADE_CATALOG, xpRequiredForNextLevel } from '@sim';
import type { RunDirectorFactory, SimConfig, TraitRuntimeFactory } from '@sim';
import { GREG_FOREST_ARSENAL_CATALOG, TraitRuntime } from '@traits';
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
import { presentActiveAttackLoadout } from './presentation/active-attacks';
import { presentBossHealth } from './presentation/boss-health';
import { presentRunSummary } from './presentation/run-summary';
import { presentRunUpgrade } from './presentation/upgrade-copy';
import { isPauseShortcut, upgradeShortcutIndex } from './presentation/upgrade-shortcuts';
import { presentRunIntro } from './presentation/run-intro';
import { presentRunProgress } from './presentation/run-progress';
import { presentPauseNotice } from './presentation/pause-notice';
import { presentActiveUniversalUpgrades } from './presentation/active-universal-upgrades';
import { calculateTerminalEssenceReward } from './presentation/terminal-essence';
import { createAudioCueRouter } from './audio/audio-cue-router';
import { createProceduralAudio } from './audio/procedural-audio';
import {
  STARTING_VITALITY_COSTS,
  STARTING_VITALITY_MAX_RANK,
  createProfileStore,
  type ProfileStorage,
} from './profile/profile-store';

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
  new TraitRuntime({ seed, initialTick, catalog: GREG_FOREST_ARSENAL_CATALOG });
const runDirectorFactory: RunDirectorFactory = ({ seed }) => new RunDirector({ seed });

/** Defers browser-storage access so restricted/private modes stay non-fatal. */
function browserProfileStorage(): ProfileStorage {
  return {
    getItem(key: string): string | null {
      return window.localStorage.getItem(key);
    },
    setItem(key: string, value: string): void {
      window.localStorage.setItem(key, value);
    },
  };
}

/** Run IDs are app-owned settlement keys, never deterministic simulation input. */
function createRunId(seed: number, sequence: number): string {
  const cryptoId = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${performance.now().toFixed(3)}`;
  return `run:${seed.toString(16)}:${sequence}:${cryptoId}`;
}

export function startApp(config: SimConfig = DEFAULT_CONFIG): AppHandle {
  const params = new URLSearchParams(window.location.search);
  const stressMode = params.get('stress') === '1';
  const renderStressMode = params.get('renderstress') === '1';
  const diagnosticsMode = params.get('debug') === '1';
  // The default stress pass stays a quick five simulated minutes. `fullrun=1`
  // continues until a terminal outcome, no later than the 8-minute normal
  // boundary, so the boss encounter can be checked through the same harness.
  const fullRunStressMode = params.get('fullrun') === '1';
  const stressStopTicks = config.hz * 60 * (fullRunStressMode ? 8 : 5);
  const seedParam = params.get('seed');
  const initialSeed = seedParam
    ? /^\d+$/.test(seedParam)
      ? Number(seedParam) >>> 0
      : seedFromString(seedParam)
    : 0x1234abcd;

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const appRoot = document.getElementById('app') as HTMLElement;
  const surface = document.getElementById('game-surface') as HTMLElement;
  const joystickZone = document.getElementById('joystick') as HTMLElement;
  const hudRoot = document.getElementById('hud') as HTMLElement;
  const adaptationsRoot = document.getElementById('adaptations') as HTMLElement;
  const controlsRoot = document.getElementById('controls') as HTMLElement;
  const pauseNoticeRoot = document.getElementById('pause-notice') as HTMLElement;
  const ctxBanner = document.getElementById('ctx-banner') as HTMLElement;
  const upgradeRoot = document.getElementById('upgrade-choices') as HTMLElement;
  const outcomeRoot = document.getElementById('run-outcome') as HTMLElement;
  const directorRoot = document.getElementById('director-notice') as HTMLElement;
  const bossHealthRoot = document.getElementById('boss-health') as HTMLElement;
  const bossHealthTitle = document.getElementById('boss-health-title') as HTMLElement;
  const bossHealthText = document.getElementById('boss-health-text') as HTMLElement;
  const bossHealthBar = document.getElementById('boss-health-bar') as HTMLElement;
  const bossHealthFill = document.getElementById('boss-health-fill') as HTMLElement;
  const introRoot = document.getElementById('run-intro') as HTMLElement;
  const introEyebrow = document.getElementById('run-intro-eyebrow') as HTMLElement;
  const introTitle = document.getElementById('run-intro-heading') as HTMLElement;
  const introObjective = document.getElementById('run-intro-objective') as HTMLElement;
  const introControls = document.getElementById('run-intro-controls') as HTMLElement;
  const introProfileRoot = document.getElementById('run-intro-profile') as HTMLElement;
  const introSoundRoot = document.getElementById('run-intro-sound') as HTMLElement;
  const introSoundToggle = document.getElementById('run-intro-sound-toggle') as HTMLInputElement;
  const introSoundStatus = document.getElementById('run-intro-sound-status') as HTMLElement;
  const introStartButton = document.getElementById('run-intro-start') as HTMLButtonElement;

  // Build details belong in the pause panel. Keeping this legacy mount empty
  // prevents the repeated on-screen move descriptions from obscuring play.
  adaptationsRoot.replaceChildren();
  adaptationsRoot.hidden = true;

  const profileStore = createProfileStore(browserProfileStorage());
  function simulationOptions() {
    return {
      traitRuntimeFactory,
      universalUpgradeCatalog: UNIVERSAL_UPGRADE_CATALOG,
      runDirectorFactory,
      runStartLoadout: profileStore.startLoadout(),
    };
  }
  const driver: SimDriver = createSimDriver(config, initialSeed, simulationOptions());
  const renderStress = renderStressMode ? createRenderStressHarness(config) : null;
  const renderer: RendererAdapter = createRenderer(canvas, config);
  const perf = createPerformanceMonitor();
  const hud = createHud(hudRoot, {
    diagnostics: diagnosticsMode,
    progress: () => presentRunProgress({
      tick: driver.tick,
      hz: config.hz,
      phase: driver.runPhase,
    }),
  });

  const keyboardInput: InputSource = createInputController({ surface, joystickZone });
  const autopilot: InputSource = createAutopilot();

  const controls: Controls = {
    paused: false,
    autopilotOn: params.get('autopilot') === '1',
    renderEnabled: true,
  };
  let controlsSoundButton: HTMLButtonElement | null = null;
  let controlsSoundStatus: HTMLElement | null = null;
  const proceduralAudio = createProceduralAudio({
    onEnableFailure: () => renderSoundControls('Sound couldn’t start; try again.'),
  });
  const audioCueRouter = createAudioCueRouter(proceduralAudio);
  const intro = presentRunIntro({
    autoStart: controls.autopilotOn || stressMode || renderStressMode,
  });
  let runStarted = !intro.holdAtStart;
  let currentSeed = initialSeed;
  let runSequence = 0;
  let currentRunId = createRunId(currentSeed, runSequence);
  let terminalRewardDetail: string | null = null;
  let upgradePromptSerial = 0;
  let syntheticDriverNow = performance.now();
  let renderedOfferKey = '';
  let activeDirectorNotice: DirectorNotice | null = null;
  let renderedDirectorKey = '';
  let renderedBossHealthKey = '';
  let renderedOutcomeKey = '';

  function renderPauseNotice(): void {
    const attacks = presentActiveAttackLoadout(driver.traitVisualState());
    const notice = presentPauseNotice(controls.paused, attacks.cards);
    const universalUpgrades = presentActiveUniversalUpgrades(driver.universalUpgradeRanks);
    pauseNoticeRoot.hidden = notice === null;
    pauseNoticeRoot.replaceChildren();
    if (notice === null) return;
    const title = document.createElement('strong');
    title.textContent = notice.title;
    const detail = document.createElement('span');
    detail.textContent = notice.detail;
    pauseNoticeRoot.append(title, detail);
    const upgradesTitle = document.createElement('strong');
    upgradesTitle.className = 'pause-upgrades-title';
    upgradesTitle.textContent = 'Active upgrades';
    pauseNoticeRoot.appendChild(upgradesTitle);
    if (attacks.cards.length === 0 && universalUpgrades.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'pause-upgrades-empty';
      empty.textContent = 'No upgrades selected yet.';
      pauseNoticeRoot.appendChild(empty);
      return;
    }
    upgradesTitle.textContent = `Active attacks · ${attacks.slotsUsed}/${attacks.slotCapacity}`;
    for (const upgrade of attacks.cards) {
      const card = document.createElement('section');
      card.className = 'pause-upgrade-card';
      const cardTitle = document.createElement('strong');
      cardTitle.textContent = `${upgrade.title} — ${upgrade.stageLabel}${upgrade.slotCost > 1 ? ` · ${upgrade.slotCost} slots` : ''}`;
      const effect = document.createElement('span');
      effect.textContent = upgrade.effect;
      const cadence = document.createElement('small');
      cadence.textContent = upgrade.cadence;
      card.append(cardTitle, effect, cadence);
      pauseNoticeRoot.appendChild(card);
    }
    if (universalUpgrades.length > 0) {
      const neutralTitle = document.createElement('strong');
      neutralTitle.className = 'pause-upgrades-title';
      neutralTitle.textContent = `Neutral run upgrades · ${driver.universalUpgradeSlotsUsed}/${driver.universalUpgradeSlotCapacity}`;
      pauseNoticeRoot.appendChild(neutralTitle);
      for (const upgrade of universalUpgrades) {
        const card = document.createElement('section');
        card.className = 'pause-upgrade-card';
        card.dataset.kind = 'universal';
        const cardTitle = document.createElement('strong');
        cardTitle.textContent = `${upgrade.title} — Rank ${upgrade.rank}/${upgrade.maxRank}`;
        const effect = document.createElement('span');
        effect.textContent = upgrade.effect;
        card.append(cardTitle, effect);
        pauseNoticeRoot.appendChild(card);
      }
    }
  }

  function renderDirectorNotice(): void {
    if (driver.runOutcome === 'victory' || driver.runOutcome === 'defeat') {
      activeDirectorNotice = null;
      if (renderedDirectorKey === '' && directorRoot.hidden) return;
      renderedDirectorKey = '';
      directorRoot.replaceChildren();
      directorRoot.hidden = true;
      return;
    }
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

  /** One presentation-owned path for click and keyboard upgrade selections. */
  function chooseUpgrade(id: string): void {
    if (!driver.upgradeSelectionPending) return;
    driver.selectUpgrade(id);
    activeInput().clear();
    driver.noteVisible(syntheticDriverNow);
    renderedOfferKey = '';
    renderUpgradeChoices();
  }

  function renderUpgradeChoices(): void {
    const offers = driver.pendingUpgradeOffers;
    const key = offers.map((offer) => {
      switch (offer.kind) {
        case 'trait': return `${offer.kind}:${offer.id}:${offer.resultStage}`;
        case 'universal': return `${offer.kind}:${offer.id}:${offer.nextRank}/${offer.maxRank}`;
        case 'essence': return `${offer.kind}:${offer.id}:${offer.amount}`;
      }
    }).join('|');
    if (key === renderedOfferKey && upgradeRoot.hidden === !driver.upgradeSelectionPending) return;
    renderedOfferKey = key;
    upgradeRoot.replaceChildren();
    upgradeRoot.hidden = !driver.upgradeSelectionPending;
    if (!driver.upgradeSelectionPending) return;

    const heading = document.createElement('h2');
    heading.id = 'upgrade-choices-heading';
    heading.textContent = 'Choose an upgrade';
    upgradeRoot.appendChild(heading);
    const shortcutHint = document.createElement('p');
    shortcutHint.id = 'upgrade-choices-shortcuts';
    shortcutHint.className = 'upgrade-shortcuts';
    shortcutHint.textContent = offers.length === 1
      ? 'Press 1, or Tab + Enter to choose.'
      : `Press 1–${offers.length}, or Tab + Enter to choose.`;
    upgradeRoot.appendChild(shortcutHint);
    for (const [index, offer] of offers.entries()) {
      const presentation = presentRunUpgrade(offer, driver.traitVisualState());
      const choice = document.createElement('button');
      choice.type = 'button';
      choice.setAttribute('aria-keyshortcuts', String(index + 1));
      const title = document.createElement('strong');
      title.textContent = `${index + 1}. ${presentation.title} — ${presentation.badge}`;
      const socket = document.createElement('small');
      socket.textContent = presentation.socket;
      const description = document.createElement('span');
      description.textContent = presentation.description;
      choice.append(title, socket, description);
      if (presentation.pairingHint !== null) {
        const hint = document.createElement('em');
        hint.textContent = presentation.pairingHint;
        choice.appendChild(hint);
      }
      choice.addEventListener('click', () => {
        chooseUpgrade(offer.id);
      });
      upgradeRoot.appendChild(choice);
    }
    upgradeRoot.querySelector<HTMLButtonElement>('button')?.focus();
    upgradePromptSerial++;
    audioCueRouter.upgradeOpened(upgradePromptSerial);
  }

  function onUpgradeShortcut(event: KeyboardEvent): void {
    if (!driver.upgradeSelectionPending) return;
    const index = upgradeShortcutIndex(event, driver.pendingUpgradeOffers.length);
    if (index === null) return;
    const offer = driver.pendingUpgradeOffers[index];
    if (offer === undefined) return;
    event.preventDefault();
    chooseUpgrade(offer.id);
  }

  function onKeyboardShortcut(event: KeyboardEvent): void {
    const runEnded = driver.runOutcome === 'victory' || driver.runOutcome === 'defeat';
    if (isPauseShortcut(event) && runStarted && !driver.upgradeSelectionPending && !runEnded) {
      event.preventDefault();
      setPaused(!controls.paused);
      return;
    }
    onUpgradeShortcut(event);
  }

  /**
   * Boss health is presentation-only and reads the app-owned current snapshot.
   * The key keeps this static DOM treatment quiet between the HUD's 4 Hz updates.
   */
  function renderBossHealth(): void {
    const boss = presentBossHealth(driver.curr.enemies);
    const key = boss === null ? '' : `${boss.id}:${boss.current}:${boss.max}`;
    if (key === renderedBossHealthKey && bossHealthRoot.hidden === (boss === null)) return;
    renderedBossHealthKey = key;
    bossHealthRoot.hidden = boss === null;
    if (boss === null) return;
    bossHealthTitle.textContent = boss.label;
    bossHealthText.textContent = `${Math.ceil(boss.current)} / ${Math.ceil(boss.max)} HP`;
    bossHealthFill.style.transform = `scaleX(${boss.fraction})`;
    bossHealthBar.setAttribute('aria-valuenow', String(boss.percent));
    bossHealthBar.setAttribute('aria-valuetext', `${boss.label}: ${boss.percent}% health remaining`);
  }

  function settleTerminalReward(outcome: 'victory' | 'defeat'): string {
    if (terminalRewardDetail !== null) return terminalRewardDetail;
    try {
      const reward = calculateTerminalEssenceReward(outcome, driver.totalKills, driver.runEssenceEarned);
      const settlement = profileStore.settleTerminalRun({
        runId: currentRunId,
        outcome,
        essenceAward: reward.total,
      });
      terminalRewardDetail = settlement.settled
        ? `+${settlement.awardedEssence} Essence banked (${settlement.profile.essence} total).`
        : `Essence for this run was already banked (${settlement.profile.essence} total).`;
      renderProfile();
    } catch {
      // Storage can be disabled or quota-limited. The run result remains valid;
      // only the optional persistent reward needs a retry on a later run.
      terminalRewardDetail = 'Essence could not be saved in this browser.';
    }
    return terminalRewardDetail;
  }

  function renderRunOutcome(): void {
    const summary = presentRunSummary(driver.runOutcome, driver.tick, config.hz, driver.runPhase);
    const rewardDetail = driver.runOutcome === 'victory' || driver.runOutcome === 'defeat'
      ? settleTerminalReward(driver.runOutcome)
      : null;
    const key = summary === null ? '' : `${summary.tone}:${summary.headline}:${summary.detail}:${rewardDetail ?? ''}`;
    if (key === renderedOutcomeKey && outcomeRoot.hidden === (summary === null)) return;
    renderedOutcomeKey = key;
    outcomeRoot.hidden = summary === null;
    outcomeRoot.replaceChildren();
    if (summary === null) return;
    outcomeRoot.dataset.outcome = summary.tone;
    const headline = document.createElement('strong');
    headline.textContent = summary.headline;
    const detail = document.createElement('span');
    detail.textContent = summary.detail;
    const reward = document.createElement('span');
    reward.className = 'outcome-essence';
    reward.textContent = rewardDetail ?? '';
    const playAgain = document.createElement('button');
    playAgain.type = 'button';
    playAgain.textContent = 'Continue to upgrades';
    playAgain.addEventListener('click', returnToStart);
    outcomeRoot.append(headline, detail, reward, playAgain);
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
  const seedInput = document.createElement('input');
  seedInput.type = 'text';
  seedInput.value = String(currentSeed);
  seedInput.size = 10;
  seedInput.style.cssText = 'font:inherit;background:#0f151f;color:#d7e0ea;border:1px solid #33415a;border-radius:5px;padding:5px;';
  function restartRun(): void {
    const raw = seedInput.value.trim();
    currentSeed = /^\d+$/.test(raw) ? Number(raw) >>> 0 : seedFromString(raw);
    seedInput.value = String(currentSeed);
    runSequence++;
    currentRunId = createRunId(currentSeed, runSequence);
    terminalRewardDetail = null;
    driver.restart(currentSeed, simulationOptions());
    activeDirectorNotice = null;
    renderedDirectorKey = '';
    renderedOfferKey = '';
    renderedBossHealthKey = '';
    renderedOutcomeKey = '';
    upgradePromptSerial = 0;
    audioCueRouter.resetForRestart();
    bossHealthRoot.hidden = true;
    renderUpgradeChoices();
    renderRunOutcome();
    renderProfile();
    syntheticDriverNow = performance.now();
    keyboardInput.clear();
    perf.reset();
    setPaused(false);
    if (runStarted) {
      proceduralAudio.resumeIfEnabled();
      audioCueRouter.beginRun();
    }
  }
  if (diagnosticsMode) {
    const autoBtn = button(controls.autopilotOn ? 'Autopilot: ON' : 'Autopilot: OFF', () => {
      controls.autopilotOn = !controls.autopilotOn;
      autoBtn.textContent = controls.autopilotOn ? 'Autopilot: ON' : 'Autopilot: OFF';
      activeInput().clear();
    });
    const renderBtn = button('Renderer: ON', () => {
      controls.renderEnabled = !controls.renderEnabled;
      renderBtn.textContent = controls.renderEnabled ? 'Renderer: ON' : 'Renderer: OFF';
    });
    controlsRoot.appendChild(seedInput);
    button('Restart w/ seed', restartRun);
  } else {
    button('Restart run', restartRun);
  }
  if (proceduralAudio.supported) {
    controlsSoundButton = button('Sound: Off', () => {
      setSoundEnabled(!proceduralAudio.enabled);
    });
    controlsSoundButton.setAttribute('aria-pressed', 'false');
    controlsSoundStatus = document.createElement('span');
    controlsSoundStatus.className = 'sound-status';
    controlsSoundStatus.setAttribute('role', 'status');
    controlsSoundStatus.hidden = true;
    controlsRoot.appendChild(controlsSoundStatus);
  }

  const profileRoot = document.createElement('section');
  profileRoot.className = 'profile-summary';
  const profileText = document.createElement('strong');
  const profileDetail = document.createElement('span');
  const vitalityButton = document.createElement('button');
  vitalityButton.type = 'button';
  profileRoot.append(profileText, profileDetail, vitalityButton);
  introProfileRoot.appendChild(profileRoot);
  let profileMessage = '';

  function renderProfile(message?: string): void {
    if (message !== undefined) profileMessage = message;
    const profile = profileStore.profile();
    const loadout = profileStore.startLoadout();
    const rank = profile.startingVitalityRank;
    const nextCost = rank < STARTING_VITALITY_MAX_RANK ? STARTING_VITALITY_COSTS[rank]! : null;
    profileText.textContent = `Essence ${profile.essence} · Vitality ${rank}/${STARTING_VITALITY_MAX_RANK}`;
    profileDetail.textContent = profileMessage || `New runs start with +${loadout.maxHpBonus} max HP.`;
    vitalityButton.disabled = nextCost === null || profile.essence < nextCost;
    vitalityButton.textContent = nextCost === null
      ? 'Starting Vitality: MAX'
      : `Buy +10 starting HP (${nextCost} Essence)`;
  }

  vitalityButton.addEventListener('click', () => {
    try {
      const purchase = profileStore.purchaseStartingVitality();
      renderProfile(purchase.purchased
        ? 'Starting Vitality purchased. It applies on your next run.'
        : purchase.reason === 'insufficient-essence'
          ? `Need ${purchase.cost ?? 0} Essence for the next rank.`
          : 'Starting Vitality is already maxed.');
    } catch {
      renderProfile('Vitality could not be saved in this browser.');
    }
  });
  renderProfile();

  function renderSoundControls(message: string | null = null): void {
    const enabled = proceduralAudio.enabled;
    introSoundToggle.checked = enabled;
    if (controlsSoundButton !== null) {
      controlsSoundButton.textContent = enabled ? 'Sound: On' : 'Sound: Off';
      controlsSoundButton.setAttribute('aria-pressed', String(enabled));
    }
    const showIntroMessage = message !== null && !runStarted;
    introSoundStatus.hidden = !showIntroMessage;
    introSoundStatus.textContent = showIntroMessage ? message : '';
    if (controlsSoundStatus !== null) {
      const showControlsMessage = message !== null && runStarted;
      controlsSoundStatus.hidden = !showControlsMessage;
      controlsSoundStatus.textContent = showControlsMessage ? message : '';
    }
  }

  function setSoundEnabled(enabled: boolean): void {
    const wasEnabled = proceduralAudio.enabled;
    const enabledAfterRequest = proceduralAudio.setEnabled(enabled);
    renderSoundControls(enabled && !enabledAfterRequest ? 'Sound couldn’t start; try again.' : null);
    if (!wasEnabled && proceduralAudio.enabled && runStarted) proceduralAudio.play('start');
  }

  function renderRunIntro(): void {
    introRoot.hidden = runStarted;
    // The full-screen dialog visually blocks the game, while inert prevents
    // hidden background controls from being reached by keyboard navigation.
    appRoot.toggleAttribute('inert', !runStarted);
    if (!runStarted) introStartButton.focus({ preventScroll: true });
  }

  function beginRun(): void {
    if (runStarted) return;
    // Profile purchases are only allowed on this prep screen. Recreate the
    // deterministic run immediately before launch so its normalized loadout
    // includes the exact Vitality rank the player just bought.
    // Do not assign a new settlement id while a terminal result is still
    // visible on the prep screen: the frame loop continues to render that
    // result, and it must remain idempotent under its original run id.
    if (driver.runOutcome === 'victory' || driver.runOutcome === 'defeat') {
      runSequence++;
      currentRunId = createRunId(currentSeed, runSequence);
      terminalRewardDetail = null;
    }
    driver.restart(currentSeed, simulationOptions());
    audioCueRouter.resetForRestart();
    activeDirectorNotice = null;
    renderedDirectorKey = '';
    renderedOfferKey = '';
    renderedBossHealthKey = '';
    renderedOutcomeKey = '';
    upgradePromptSerial = 0;
    bossHealthRoot.hidden = true;
    renderUpgradeChoices();
    renderRunOutcome();
    runStarted = true;
    keyboardInput.clear();
    // The paused driver already refreshes its timestamp each frame, but this
    // makes the no-catch-up guarantee explicit at the player-controlled gate.
    driver.noteVisible(stressMode ? syntheticDriverNow : performance.now());
    renderRunIntro();
    proceduralAudio.resumeIfEnabled();
    audioCueRouter.beginRun();
    surface.focus({ preventScroll: true });
  }

  /** Leave a terminal card for the between-run prep screen without replaying it. */
  function returnToStart(): void {
    if (driver.runOutcome !== 'victory' && driver.runOutcome !== 'defeat') return;
    profileMessage = '';
    runStarted = false;
    setPaused(false);
    renderProfile();
    introStartButton.textContent = 'Start next run';
    renderRunIntro();
  }

  introEyebrow.textContent = intro.eyebrow;
  introTitle.textContent = intro.title;
  introObjective.textContent = intro.objective;
  introControls.textContent = intro.controls;
  introStartButton.textContent = intro.cta;
  introSoundRoot.hidden = !proceduralAudio.supported;
  const onIntroSoundToggle = (): void => setSoundEnabled(introSoundToggle.checked);
  introSoundToggle.addEventListener('change', onIntroSoundToggle);
  introStartButton.addEventListener('click', beginRun);
  renderSoundControls();
  renderRunIntro();

  function setPaused(p: boolean): void {
    controls.paused = p;
    pauseBtn.textContent = p ? 'Resume' : 'Pause';
    renderPauseNotice();
    if (p) activeInput().clear();
    else proceduralAudio.resumeIfEnabled();
  }

  function activeInput(): InputSource {
    return controls.autopilotOn ? autopilot : keyboardInput;
  }

  // ---- lifecycle listeners -------------------------------------------------
  const onResize = (): void => renderer.resize();
  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKeyboardShortcut);

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
    const effectivePaused = !runStarted || controls.paused || rendererLost || driver.upgradeSelectionPending || runEnded;

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
      if (firstOffer !== undefined) driver.selectUpgrade(firstOffer.id);
    }
    audioCueRouter.observe({
      tick: driver.tick,
      combatFeedback: driver.combatFeedback,
      traitPresentationEvents: driver.traitPresentationEvents,
      runOutcome: driver.runOutcome,
    });
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
        driver.combatFeedback,
        driver.traitPresentationEvents,
      );
    }

    perf.frame(frameTimeMs);
    ctxBanner.style.display = rendererLost ? 'block' : 'none';

    if (now - lastHudAt >= HUD_INTERVAL_MS) {
      lastHudAt = now;
      cachedHash = driver.hash();
      const rs = renderer.stats();
      const [, frameP95Ms, frameP99Ms] = perf.percentiles();
      const playerSnapshot = driver.curr;
      const stats: HudStats = {
        fps: perf.fps,
        frameTimeMs: perf.frameTimeMs,
        frameP95Ms,
        frameP99Ms,
        playerHp: playerSnapshot.playerHp,
        playerMaxHp: playerSnapshot.playerMaxHp,
        playerXp: playerSnapshot.playerXp,
        playerLevel: playerSnapshot.playerLevel,
        playerNextXp: xpRequiredForNextLevel(config.xpThresholds, playerSnapshot.playerLevel),
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
      renderBossHealth();
    }
  }
  raf = requestAnimationFrame(frame);

  function stop(): void {
    running = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKeyboardShortcut);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibility);
    introSoundToggle.removeEventListener('change', onIntroSoundToggle);
    introStartButton.removeEventListener('click', beginRun);
    introRoot.hidden = true;
    appRoot.toggleAttribute('inert', false);
    keyboardInput.dispose();
    autopilot.dispose();
    renderer.dispose();
    hud.dispose();
    proceduralAudio.dispose();
  }

  // Console-visible note so stress evidence is never mistaken for a threshold.
  console.info(`[web-toy] running. Frame-time/draw-call figures are ${RESOLUTION_NOTE}.`);

  return { stop, driver, controls };
}
