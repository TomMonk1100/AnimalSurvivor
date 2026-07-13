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
import {
  DEFAULT_CONFIG,
  BIOME_IDS,
  getHeroDefinition,
  getHeroBasicAttackDefinition,
  getUniversalUpgradeCatalogForHero,
  HERO_IDS,
  runAttackDamageLabReport,
  serializeReplay,
  UNIVERSAL_UPGRADE_CATALOG,
  xpRequiredForNextLevel,
} from '@sim';
import type { BiomeId, HeroId, RunDirectorFactory, SimConfig, TraitRuntimeFactory } from '@sim';
import { GREG_FOREST_ARSENAL_CATALOG, TraitRuntime } from '@traits';
import { GREG_FIRST_RUN, RunDirector, SALTWIND_RUINS_RUN } from '@director';
import type { HudStats, InputMode, InputSource } from './contracts';
import { createSimDriver, MAX_CATCHUP_TICKS, type SimDriver } from './sim/simulation-driver';
import { createRenderer } from './render/playcanvas-scene';
import { createUnavailableRenderer } from './render/unavailable-renderer';
import { HERO_VISUAL_PROFILES, getHeroVisualProfile } from './hero/hero-roster';
import { createInputController } from './input/input-controller';
import { presentInputMode, presentKeyboardInputMode } from './input/input-mode';
import { createAutopilot } from './stress/autopilot';
import { createRenderStressHarness } from './stress/render-stress-snapshots';
import { createPerformanceMonitor } from './diagnostics/performance-monitor';
import { createHud } from './diagnostics/debug-hud';
import { createAttackDamageLabPanel } from './diagnostics/attack-damage-lab';
import type { RendererAdapter } from './contracts';
import { projectDirectorEvent, type DirectorNotice } from './presentation/director-notices';
import { presentActiveAttackLoadout } from './presentation/active-attacks';
import { presentBossHealth } from './presentation/boss-health';
import { getBossPortraitAsset } from './presentation/boss-art';
import { presentPlayerHealth } from './presentation/player-health';
import { presentRunSummary } from './presentation/run-summary';
import { presentRunUpgrade } from './presentation/upgrade-copy';
import { isPauseShortcut, upgradeShortcutIndex } from './presentation/upgrade-shortcuts';
import { presentRunIntro } from './presentation/run-intro';
import { WILDGUARD_KEYART_URL } from './presentation/wildguard-keyart';
import { presentRunProgress } from './presentation/run-progress';
import { presentPauseNotice } from './presentation/pause-notice';
import { presentActiveUniversalUpgrades } from './presentation/active-universal-upgrades';
import { presentEnemyGlossary } from './presentation/enemy-glossary';
import { calculateTerminalEssenceReward } from './presentation/terminal-essence';
import { focusModalStart, trapModalFocus } from './presentation/modal-focus';
import { pauseForHiddenPage, resumeFromVisiblePage, type VisibilityPauseState } from './presentation/visibility-pause';
import { createAudioCueRouter } from './audio/audio-cue-router';
import { createProceduralAudio, type MusicState } from './audio/procedural-audio';
import {
  STARTING_VITALITY_COSTS,
  STARTING_VITALITY_MAX_RANK,
  createProfileStore,
  type ProfileStorage,
} from './profile/profile-store';
import {
  createFieldGuideEntry,
  getHeroPortraitAsset,
  presentFieldGuideEvolutionTree,
  presentFieldGuidePortrait,
  presentFieldGuideRecipes,
} from './profile/field-guide';
import { CHALLENGE_IDS, presentFieldGuideChallenges } from './profile/challenges';
import { HABITAT_IDS, presentFieldGuideHabitats } from './profile/habitats';
import { createAccessibilitySettingsStore } from './profile/accessibility-settings';
import { createKeyboardBindingsStore } from './profile/keyboard-bindings';
import { PALETTE_IDS, getPaletteDefinition, presentPaletteName, type PaletteId } from './profile/palettes';
import { formatFieldGuideIssueReport } from './release/issue-report';
import { BUILD_INFO, formatBuildLabel } from './build-info';

/** Deterministic 32-bit seed from a string (djb2). Used only for UI convenience. */
function seedFromString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

function signedInteger(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
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
  const biomeParam = params.get('biome');
  const requestedBiomeId: BiomeId | null = (BIOME_IDS as readonly string[]).includes(biomeParam ?? '')
    ? biomeParam as BiomeId
    : null;

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const appRoot = document.getElementById('app') as HTMLElement;
  const surface = document.getElementById('game-surface') as HTMLElement;
  const joystickZone = document.getElementById('joystick') as HTMLElement;
  const hudRoot = document.getElementById('hud') as HTMLElement;
  const playerHealthRoot = document.getElementById('player-health') as HTMLElement;
  const playerHealthTitle = document.getElementById('player-health-title') as HTMLElement;
  const playerHealthText = document.getElementById('player-health-text') as HTMLElement;
  const playerHealthBar = document.getElementById('player-health-bar') as HTMLElement;
  const playerHealthFill = document.getElementById('player-health-fill') as HTMLElement;
  const adaptationsRoot = document.getElementById('adaptations') as HTMLElement;
  const controlsRoot = document.getElementById('controls') as HTMLElement;
  const inputModeStatus = document.getElementById('input-mode-status') as HTMLElement;
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
  const bossHealthPortrait = document.getElementById('boss-health-portrait') as HTMLImageElement;
  bossHealthPortrait.addEventListener('error', () => {
    bossHealthPortrait.hidden = true;
  });
  const introRoot = document.getElementById('run-intro') as HTMLElement;
  introRoot.style.setProperty('--wildguard-keyart', `url("${WILDGUARD_KEYART_URL}")`);
  const introEyebrow = document.getElementById('run-intro-eyebrow') as HTMLElement;
  const introTitle = document.getElementById('run-intro-heading') as HTMLElement;
  const introObjective = document.getElementById('run-intro-objective') as HTMLElement;
  const introControls = document.getElementById('run-intro-controls') as HTMLElement;
  const buildIdentityRoot = document.getElementById('build-identity') as HTMLElement;
  const introProfileRoot = document.getElementById('run-intro-profile') as HTMLElement;
  const heroSelectionRoot = document.createElement('section');
  heroSelectionRoot.className = 'hero-selection';
  heroSelectionRoot.setAttribute('aria-label', 'Choose a founding hero');
  introProfileRoot.appendChild(heroSelectionRoot);
  const introSoundRoot = document.getElementById('run-intro-sound') as HTMLElement;
  const introSoundToggle = document.getElementById('run-intro-sound-toggle') as HTMLInputElement;
  const introSoundStatus = document.getElementById('run-intro-sound-status') as HTMLElement;
  const introAudioMixRoot = document.getElementById('run-intro-audio-mix') as HTMLDetailsElement;
  const masterVolumeInput = document.getElementById('audio-master-volume') as HTMLInputElement;
  const musicVolumeInput = document.getElementById('audio-music-volume') as HTMLInputElement;
  const sfxVolumeInput = document.getElementById('audio-sfx-volume') as HTMLInputElement;
  const masterVolumeValue = document.getElementById('audio-master-volume-value') as HTMLOutputElement;
  const musicVolumeValue = document.getElementById('audio-music-volume-value') as HTMLOutputElement;
  const sfxVolumeValue = document.getElementById('audio-sfx-volume-value') as HTMLOutputElement;
  const introStartButton = document.getElementById('run-intro-start') as HTMLButtonElement;

  // The intro is a sibling of the gameplay surface. Only gameplay roots are
  // inert while it is open; putting inert on appRoot would also inert the
  // dialog and make its launch/settings controls unreachable.
  const introBackgroundRoots = [
    surface,
    hudRoot,
    playerHealthRoot,
    adaptationsRoot,
    controlsRoot,
    pauseNoticeRoot,
    upgradeRoot,
    directorRoot,
    bossHealthRoot,
    outcomeRoot,
    ctxBanner,
  ] as const;

  buildIdentityRoot.textContent = formatBuildLabel();
  buildIdentityRoot.dataset.buildId = BUILD_INFO.buildId;
  buildIdentityRoot.title = `Commit ${BUILD_INFO.commitSha} · content ${BUILD_INFO.contentFingerprint} · assets ${BUILD_INFO.assetManifestHash}`;
  // Build identity remains available in metadata and the optional support
  // report, but a player-facing tab should read like a game, not a prototype.
  document.title = 'Animal Survivor — Wildguard';
  document.querySelector('meta[name="animal-survivor-build-id"]')?.setAttribute('content', BUILD_INFO.buildId);

  // Build details belong in the pause panel. Keeping this legacy mount empty
  // prevents the repeated on-screen move descriptions from obscuring play.
  adaptationsRoot.replaceChildren();
  adaptationsRoot.hidden = true;

  const profileStore = createProfileStore(browserProfileStorage());
  const accessibilitySettingsStore = createAccessibilitySettingsStore(browserProfileStorage());
  const keyboardBindingsStore = createKeyboardBindingsStore(browserProfileStorage());
  const profileAtLaunch = profileStore.profile();
  const selectedBiomeId: BiomeId = requestedBiomeId !== null
    && profileAtLaunch.unlockedBiomeIds.includes(requestedBiomeId)
    ? requestedBiomeId
    : 'forest';
  const biomeWasLocked = requestedBiomeId !== null && selectedBiomeId !== requestedBiomeId;
  const runDefinition = selectedBiomeId === 'saltwind' ? SALTWIND_RUINS_RUN : GREG_FIRST_RUN;
  const runDirectorFactory: RunDirectorFactory = ({ seed }) => new RunDirector({ seed, definition: runDefinition });
  const queryHeroId = params.get('hero');
  const selectedQueryHero = queryHeroId !== null
    && (HERO_IDS as readonly string[]).includes(queryHeroId)
    ? queryHeroId as HeroId
    : null;
  let selectedHeroId: HeroId = selectedQueryHero ?? profileStore.profile().selectedHeroId;
  function simulationOptions() {
    const profileLoadout = profileStore.startLoadout();
    return {
      traitRuntimeFactory,
      universalUpgradeCatalog: getUniversalUpgradeCatalogForHero(selectedHeroId, UNIVERSAL_UPGRADE_CATALOG),
      runDirectorFactory,
      runStartLoadout: { ...profileLoadout, heroId: selectedHeroId, biomeId: selectedBiomeId },
    };
  }
  const driver: SimDriver = createSimDriver(config, initialSeed, simulationOptions());
  const renderStress = renderStressMode ? createRenderStressHarness(config) : null;
  let renderer: RendererAdapter;
  try {
    renderer = createRenderer(
      canvas,
      config,
      selectedHeroId,
      selectedBiomeId,
      accessibilitySettingsStore.settings().qualityTier,
      profileAtLaunch.selectedPaletteId,
    );
  } catch (error) {
    console.error('[web-toy] WebGL2 renderer unavailable; simulation is paused.', error);
    renderer = createUnavailableRenderer();
    ctxBanner.textContent = 'WebGL2 unavailable — simulation paused. Use a browser with WebGL2 enabled.';
  }
  const perf = createPerformanceMonitor();
  const hud = createHud(hudRoot, {
    diagnostics: diagnosticsMode,
    heroName: () => getHeroVisualProfile(selectedHeroId).displayName,
    progress: () => presentRunProgress({
      tick: driver.tick,
      hz: config.hz,
      phase: driver.runPhase,
      biomeId: selectedBiomeId,
      bossRequestTick: runDefinition.boss.requestTick,
      durationTicks: runDefinition.durationTicks,
    }),
  });

  let keyboardInput: InputSource = createInputController({
    surface,
    joystickZone,
    keyboardBindings: keyboardBindingsStore.bindings(),
  });
  const autopilot: InputSource = createAutopilot();

  function recreateKeyboardInput(): void {
    keyboardInput.dispose();
    keyboardInput = createInputController({
      surface,
      joystickZone,
      keyboardBindings: keyboardBindingsStore.bindings(),
    });
  }

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
    heroId: selectedHeroId,
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
  let renderedInputMode = '';
  let visibilityPauseState: VisibilityPauseState = Object.freeze({ pausedByVisibility: false });
  let soundPreferenceSet = false;

  function renderInputModeStatus(): void {
    if (controls.autopilotOn) {
      const text = 'Input: Autopilot diagnostic';
      if (renderedInputMode === text) return;
      renderedInputMode = text;
      inputModeStatus.textContent = text;
      return;
    }
    const mode: InputMode = keyboardInput.inputMode?.() ?? 'keyboard';
    const presentation = mode === 'keyboard'
      ? presentKeyboardInputMode(keyboardBindingsStore.bindings())
      : presentInputMode(mode);
    const text = `Input: ${presentation.label} · ${presentation.guidance}`;
    if (renderedInputMode === text) return;
    renderedInputMode = text;
    inputModeStatus.textContent = text;
  }

  function renderIntroCopy(): void {
    const copy = presentRunIntro({
      autoStart: controls.autopilotOn || stressMode || renderStressMode,
      heroId: selectedHeroId,
    });
    introEyebrow.textContent = selectedBiomeId === 'saltwind'
      ? 'Animal Survivor · Saltwind Ruins'
      : biomeWasLocked
        ? 'Animal Survivor · Forest Arsenal (Saltwind locked)'
        : copy.eyebrow;
    introTitle.textContent = copy.title;
    introObjective.textContent = copy.objective;
    introControls.textContent = copy.controls;
    introStartButton.textContent = runStarted ? 'Run active' : copy.cta;
  }

  function renderHeroSelection(): void {
    heroSelectionRoot.replaceChildren();
    const heading = document.createElement('strong');
    heading.textContent = 'Choose your animal';
    heroSelectionRoot.appendChild(heading);
    const detail = document.createElement('span');
    detail.textContent = 'Hero stats are part of the deterministic run identity.';
    heroSelectionRoot.appendChild(detail);
    const choices = document.createElement('div');
    choices.className = 'hero-selection-choices';
    for (const hero of HERO_VISUAL_PROFILES) {
      const choice = document.createElement('button');
      choice.type = 'button';
      choice.disabled = runStarted;
      choice.dataset.selected = String(hero.id === selectedHeroId);
      choice.dataset.hero = hero.id;
      choice.style.setProperty('--hero-primary', hero.palette[0]);
      choice.style.setProperty('--hero-accent', hero.palette[1]);
      const portraitAsset = getHeroPortraitAsset(hero.id);
      const portraitFrame = document.createElement('span');
      portraitFrame.className = 'hero-selection-portrait-frame';
      portraitFrame.dataset.state = 'loading';
      portraitFrame.style.setProperty('--portrait-accent', portraitAsset.fallbackAccent);
      const portraitFallback = document.createElement('span');
      portraitFallback.className = 'hero-selection-portrait-fallback';
      portraitFallback.setAttribute('aria-hidden', 'true');
      portraitFallback.textContent = portraitAsset.fallbackGlyph;
      const portrait = document.createElement('img');
      portrait.className = 'hero-selection-portrait';
      portrait.alt = portraitAsset.assetAlt;
      portrait.loading = 'lazy';
      portrait.decoding = 'async';
      portrait.addEventListener('load', () => {
        portraitFrame.dataset.state = 'loaded';
      }, { once: true });
      portrait.addEventListener('error', () => {
        portraitFrame.dataset.state = 'fallback';
        portrait.hidden = true;
      }, { once: true });
      portrait.src = portraitAsset.assetUrl;
      portraitFrame.append(portraitFallback, portrait);
      const title = document.createElement('strong');
      title.textContent = `${hero.displayName} · ${hero.species}`;
      const epithet = document.createElement('small');
      epithet.textContent = hero.epithet;
      const description = document.createElement('span');
      description.textContent = hero.description;
      const characterLine = document.createElement('span');
      characterLine.className = 'hero-character-line';
      characterLine.textContent = hero.characterLine;
      const silhouette = document.createElement('em');
      silhouette.textContent = hero.silhouette;
      const statLine = document.createElement('small');
      statLine.className = 'hero-stat-line';
      statLine.textContent = hero.statLine;
      choice.append(portraitFrame, title, epithet, description, characterLine, statLine, silhouette);
      choice.addEventListener('click', () => {
        if (runStarted || hero.id === selectedHeroId) return;
        try {
          profileStore.selectHero(hero.id);
          selectedHeroId = hero.id;
          renderer.setHero(selectedHeroId);
          renderIntroCopy();
          renderHeroSelection();
          renderProfile();
        } catch {
          renderProfile('Hero selection could not be saved in this browser.');
        }
      });
      choices.appendChild(choice);
    }
    heroSelectionRoot.appendChild(choices);
  }

  function renderPauseNotice(): void {
    const attacks = presentActiveAttackLoadout(
      driver.traitVisualState(),
      getHeroBasicAttackDefinition(getHeroDefinition(selectedHeroId).basicAttackId),
    );
    const notice = presentPauseNotice(controls.paused, attacks.cards);
    const universalUpgrades = presentActiveUniversalUpgrades(
      driver.universalUpgradeRanks,
      driver.universalUpgradeCatalog ?? UNIVERSAL_UPGRADE_CATALOG,
    );
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
    } else {
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
        const runUpgradesTitle = document.createElement('strong');
        runUpgradesTitle.className = 'pause-upgrades-title';
        runUpgradesTitle.textContent = `Run upgrades · ${driver.universalUpgradeSlotsUsed}/${driver.universalUpgradeSlotCapacity}`;
        pauseNoticeRoot.appendChild(runUpgradesTitle);
        const neutralUpgrades = universalUpgrades.filter((upgrade) => upgrade.kind === 'neutral');
        const starterMasteries = universalUpgrades.filter((upgrade) => upgrade.kind === 'starterMastery');
        if (neutralUpgrades.length > 0) {
          const neutralTitle = document.createElement('strong');
          neutralTitle.className = 'pause-upgrades-title';
          neutralTitle.textContent = 'Neutral passives';
          pauseNoticeRoot.appendChild(neutralTitle);
        }
        for (const upgrade of neutralUpgrades) {
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
        if (starterMasteries.length > 0) {
          const masteryTitle = document.createElement('strong');
          masteryTitle.className = 'pause-upgrades-title';
          masteryTitle.textContent = 'Starter mastery';
          pauseNoticeRoot.appendChild(masteryTitle);
        }
        for (const upgrade of starterMasteries) {
          const card = document.createElement('section');
          card.className = 'pause-upgrade-card';
          card.dataset.kind = 'starter-mastery';
          const cardTitle = document.createElement('strong');
          cardTitle.textContent = `${upgrade.title} — Rank ${upgrade.rank}/${upgrade.maxRank}`;
          const effect = document.createElement('span');
          effect.textContent = upgrade.effect;
          card.append(cardTitle, effect);
          pauseNoticeRoot.appendChild(card);
        }
      }
    }
    const actions = document.createElement('div');
    actions.className = 'pause-actions';
    for (const action of notice.actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.pauseAction = action.id;
      button.textContent = action.label;
      button.addEventListener('click', () => {
        switch (action.id) {
          case 'resume':
            setPaused(false);
            break;
          case 'restart':
            restartRun();
            break;
          case 'quit':
            quitToDen();
            break;
        }
      });
      actions.appendChild(button);
    }
    pauseNoticeRoot.appendChild(actions);
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
      const projected = projectDirectorEvent(event, selectedBiomeId, getHeroVisualProfile(selectedHeroId).displayName);
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
      const presentation = presentRunUpgrade(
        offer,
        driver.traitVisualState(),
        getHeroVisualProfile(selectedHeroId).displayName,
        driver.universalUpgradeCatalog ?? UNIVERSAL_UPGRADE_CATALOG,
      );
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
    const boss = presentBossHealth(driver.curr.enemies, selectedBiomeId);
    const key = boss === null ? '' : `${boss.id}:${boss.current}:${boss.max}`;
    if (key === renderedBossHealthKey && bossHealthRoot.hidden === (boss === null)) return;
    renderedBossHealthKey = key;
    bossHealthRoot.hidden = boss === null;
    if (boss === null) return;
    bossHealthRoot.dataset.biome = selectedBiomeId;
    bossHealthTitle.textContent = boss.label;
    bossHealthText.textContent = `${Math.ceil(boss.current)} / ${Math.ceil(boss.max)} HP`;
    const bossPortrait = getBossPortraitAsset(selectedBiomeId);
    bossHealthPortrait.src = bossPortrait.assetUrl;
    bossHealthPortrait.alt = bossPortrait.assetAlt;
    bossHealthPortrait.hidden = false;
    bossHealthFill.style.transform = `scaleX(${boss.fraction})`;
    bossHealthBar.setAttribute('aria-valuenow', String(boss.percent));
    bossHealthBar.setAttribute('aria-valuetext', `${boss.label}: ${boss.percent}% health remaining`);
  }

  function renderPlayerHealth(): void {
    const health = presentPlayerHealth(driver.curr.playerHp, driver.curr.playerMaxHp);
    playerHealthRoot.hidden = health === null;
    if (health === null) return;
    playerHealthTitle.textContent = `${getHeroVisualProfile(selectedHeroId).displayName} health`;
    playerHealthText.textContent = `${Math.ceil(health.current)} / ${Math.ceil(health.max)} HP`;
    playerHealthFill.style.transform = `scaleX(${health.fraction})`;
    playerHealthFill.style.background = health.fraction <= 0.25
      ? 'linear-gradient(90deg, #ef5b5b, #ffb15b)'
      : health.fraction <= 0.5
        ? 'linear-gradient(90deg, #e2a443, #f4df78)'
        : 'linear-gradient(90deg, #45d477, #c9f26b)';
    playerHealthBar.setAttribute('aria-valuenow', String(health.percent));
    playerHealthBar.setAttribute('aria-valuetext', `${playerHealthTitle.textContent}: ${health.percent}% health remaining`);
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
      profileStore.recordFieldGuideEntry(createFieldGuideEntry({
        runId: currentRunId,
        heroId: selectedHeroId,
        biomeId: selectedBiomeId,
        seed: currentSeed,
        outcome,
        durationTicks: driver.tick,
        kills: driver.totalKills,
        essenceEarned: reward.total,
        visuals: driver.traitVisualState(),
        universalUpgradeRanks: driver.universalUpgradeRanks,
      }));
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
    const summary = presentRunSummary(
      driver.runOutcome,
      driver.tick,
      config.hz,
      driver.runPhase,
      getHeroVisualProfile(selectedHeroId).displayName,
    );
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
    const replayButton = document.createElement('button');
    replayButton.type = 'button';
    replayButton.textContent = 'Copy replay';
    replayButton.addEventListener('click', () => {
      const clipboard = navigator.clipboard;
      if (clipboard === undefined) {
        renderProfile('Clipboard access is unavailable; replay export could not start.');
        return;
      }
      try {
        void clipboard.writeText(serializeReplay(driver.replay())).then(() => {
          replayButton.textContent = 'Replay copied';
        }).catch(() => {
          renderProfile('Clipboard access was denied; replay export could not start.');
        });
      } catch {
        renderProfile('Replay export is unavailable in this browser.');
      }
    });
    outcomeRoot.append(headline, detail, reward, playAgain, replayButton);
  }

  // ---- controls UI (built once; no per-frame DOM creation) ----------------
  function button(label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', onClick);
    controlsRoot.appendChild(b);
    return b;
  }
  const pauseBtn = button('Pause', () => {
    // Upgrade selection already freezes the simulation and owns keyboard focus.
    // Do not layer an actionable pause card beneath that modal.
    if (driver.upgradeSelectionPending) return;
    setPaused(!controls.paused);
  });
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

  /** Abandon a live run without granting terminal rewards or archiving it. */
  function quitToDen(): void {
    if (!runStarted) return;
    runStarted = false;
    restartRun();
    proceduralAudio.suspend();
    profileMessage = '';
    introStartButton.textContent = 'Start run';
    renderIntroCopy();
    renderProfile();
    renderRunIntro();
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
    // The proof harness runs separate deterministic simulations. It never reads or
    // mutates this live driver, so it can be trusted as an independent answer
    // to "did this attack actually damage something?" rather than telemetry
    // inferred from a visual effect.
    const report = runAttackDamageLabReport();
    createAttackDamageLabPanel(appRoot, report.results.map((result) => ({
      id: result.id,
      title: result.name,
      category: result.category,
      durationTicks: report.durationTicks,
      hz: report.durationTicks / report.durationSeconds,
      totalDamage: result.totalDamage,
      kills: result.kills,
      hitCount: result.hitCount,
      status: result.status === 'damage-confirmed'
        ? 'confirmed'
        : result.status === 'utility-confirmed'
          ? 'utility-only'
          : 'not-confirmed',
      note: result.notes,
    })));
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
  const accessibilityRoot = document.createElement('section');
  accessibilityRoot.className = 'accessibility-settings';
  accessibilityRoot.setAttribute('aria-label', 'Accessibility settings');
  const paletteRoot = document.createElement('section');
  paletteRoot.className = 'palette-settings';
  paletteRoot.setAttribute('aria-label', 'Field Guide palettes');
  const creditsRoot = document.createElement('section');
  creditsRoot.className = 'credits-notices';
  creditsRoot.setAttribute('aria-label', 'Credits and notices');
  const fieldGuideRoot = document.createElement('section');
  fieldGuideRoot.className = 'field-guide';
  fieldGuideRoot.setAttribute('aria-label', 'Field Guide');
  const fieldGuideToggle = document.createElement('button');
  fieldGuideToggle.type = 'button';
  const fieldGuidePanel = document.createElement('div');
  fieldGuidePanel.className = 'field-guide-panel';
  fieldGuideRoot.append(fieldGuideToggle, fieldGuidePanel);
  profileRoot.append(profileText, profileDetail, vitalityButton, accessibilityRoot, paletteRoot, creditsRoot, fieldGuideRoot);
  introProfileRoot.appendChild(profileRoot);
  let profileMessage = '';
  let fieldGuideOpen = false;

  function applyAccessibilitySettings(): void {
    const settings = accessibilitySettingsStore.settings();
    document.documentElement.dataset.reducedMotion = String(settings.reducedMotion);
    document.documentElement.dataset.reducedFlashes = String(settings.reducedFlashes);
    document.documentElement.dataset.highContrast = String(settings.highContrast);
    document.documentElement.dataset.qualityTier = settings.qualityTier;
    renderer.setQualityTier?.(settings.qualityTier);
  }

  function applyPalette(): void {
    const palette = getPaletteDefinition(profileStore.profile().selectedPaletteId);
    document.documentElement.dataset.palette = palette.id;
    document.documentElement.style.setProperty('--palette-primary', palette.primary);
    document.documentElement.style.setProperty('--palette-accent', palette.accent);
    document.documentElement.style.setProperty('--palette-glow', palette.glow);
    renderer.setPalette?.(palette.id);
  }

  function renderPaletteSelection(): void {
    paletteRoot.replaceChildren();
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    const profile = profileStore.profile();
    summary.textContent = `Field Guide palettes · ${profile.unlockedPaletteIds.length}/${PALETTE_IDS.length}`;
    details.appendChild(summary);
    const hint = document.createElement('span');
    hint.className = 'palette-settings-hint';
    hint.textContent = 'Discover a Mythic form to unlock its presentation palette.';
    details.appendChild(hint);
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Selected Field Guide palette');
    for (const paletteId of PALETTE_IDS) {
      if (!profile.unlockedPaletteIds.includes(paletteId)) continue;
      const option = document.createElement('option');
      option.value = paletteId;
      option.textContent = presentPaletteName(paletteId);
      select.appendChild(option);
    }
    select.value = profile.selectedPaletteId;
    select.addEventListener('change', () => {
      try {
        const selected = select.value as PaletteId;
        profileStore.selectPalette(selected);
        applyPalette();
        renderProfile(`${presentPaletteName(selected)} palette selected.`);
      } catch {
        select.value = profileStore.profile().selectedPaletteId;
        renderProfile('That presentation palette is still locked.');
      }
    });
    details.appendChild(select);
    paletteRoot.appendChild(details);
  }

  function renderAccessibilitySettings(): void {
    accessibilityRoot.replaceChildren();
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Accessibility';
    details.appendChild(summary);
    const hint = document.createElement('span');
    hint.className = 'accessibility-settings-hint';
    hint.textContent = 'Presentation-only settings; run hashes and rewards stay unchanged.';
    details.appendChild(hint);
    const settings = accessibilitySettingsStore.settings();
    const options = [
      ['reducedMotion', 'Reduce motion', 'Shorten interface transitions and nonessential movement.'],
      ['reducedFlashes', 'Reduce flashes', 'Tone down interface danger pulses and combat feedback flashes.'],
      ['highContrast', 'High contrast', 'Increase prep-screen contrast for text, borders, and danger notices.'],
    ] as const;
    for (const [key, labelText, description] of options) {
      const label = document.createElement('label');
      label.className = 'accessibility-setting';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = settings[key];
      input.addEventListener('change', () => {
        try {
          accessibilitySettingsStore.update({ [key]: input.checked });
          applyAccessibilitySettings();
        } catch {
          input.checked = accessibilitySettingsStore.settings()[key];
        }
      });
      const copy = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = labelText;
      const detail = document.createElement('small');
      detail.textContent = description;
      copy.append(title, detail);
      label.append(input, copy);
      details.appendChild(label);
    }
    const qualityLabel = document.createElement('label');
    qualityLabel.className = 'accessibility-setting';
    const qualityCopy = document.createElement('span');
    const qualityTitle = document.createElement('strong');
    qualityTitle.textContent = 'Render quality';
    const qualityDetail = document.createElement('small');
    qualityDetail.textContent = 'Reduced caps device pixel ratio at 1× while preserving simulation fairness.';
    qualityCopy.append(qualityTitle, qualityDetail);
    const qualitySelect = document.createElement('select');
    qualitySelect.setAttribute('aria-label', 'Render quality');
    for (const option of [
      ['standard', 'Standard'],
      ['reduced', 'Reduced'],
    ] as const) {
      const optionElement = document.createElement('option');
      optionElement.value = option[0];
      optionElement.textContent = option[1];
      qualitySelect.appendChild(optionElement);
    }
    qualitySelect.value = settings.qualityTier;
    qualitySelect.addEventListener('change', () => {
      try {
        accessibilitySettingsStore.update({ qualityTier: qualitySelect.value as 'standard' | 'reduced' });
        applyAccessibilitySettings();
      } catch {
        qualitySelect.value = accessibilitySettingsStore.settings().qualityTier;
      }
    });
    qualityLabel.append(qualityCopy, qualitySelect);
    details.appendChild(qualityLabel);
    const keyboardDetails = document.createElement('details');
    const keyboardSummary = document.createElement('summary');
    keyboardSummary.textContent = 'Keyboard controls';
    keyboardDetails.appendChild(keyboardSummary);
    const keyboardHint = document.createElement('span');
    keyboardHint.className = 'accessibility-settings-hint';
    keyboardHint.textContent = 'Choose one unique key per direction. Arrow Keys always remain available.';
    keyboardDetails.appendChild(keyboardHint);
    const bindings = keyboardBindingsStore.bindings();
    for (const [direction, labelText] of [
      ['up', 'Move up'],
      ['left', 'Move left'],
      ['down', 'Move down'],
      ['right', 'Move right'],
    ] as const) {
      const label = document.createElement('label');
      label.className = 'accessibility-setting keyboard-binding';
      const copy = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = labelText;
      const detail = document.createElement('small');
      detail.textContent = `Current key: ${bindings[direction].toUpperCase()}`;
      copy.append(title, detail);
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 1;
      input.value = bindings[direction];
      input.setAttribute('aria-label', `${labelText} key`);
      input.addEventListener('change', () => {
        try {
          const patch = direction === 'up'
            ? { up: input.value }
            : direction === 'down'
              ? { down: input.value }
              : direction === 'left'
                ? { left: input.value }
                : { right: input.value };
          keyboardBindingsStore.update(patch);
          recreateKeyboardInput();
          renderInputModeStatus();
          renderAccessibilitySettings();
        } catch {
          input.value = keyboardBindingsStore.bindings()[direction];
          renderProfile('Choose one unique, non-space keyboard key for each direction.');
        }
      });
      label.append(copy, input);
      keyboardDetails.appendChild(label);
    }
    const resetKeyboard = document.createElement('button');
    resetKeyboard.type = 'button';
    resetKeyboard.textContent = 'Reset keyboard controls';
    resetKeyboard.addEventListener('click', () => {
      keyboardBindingsStore.reset();
      recreateKeyboardInput();
      renderInputModeStatus();
      renderAccessibilitySettings();
    });
    keyboardDetails.appendChild(resetKeyboard);
    details.appendChild(keyboardDetails);
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'Reset accessibility';
    reset.addEventListener('click', () => {
      accessibilitySettingsStore.reset();
      applyAccessibilitySettings();
      renderAccessibilitySettings();
    });
    details.appendChild(reset);
    accessibilityRoot.appendChild(details);
  }

  function renderCreditsNotices(): void {
    creditsRoot.replaceChildren();
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = 'Credits & notices';
    details.appendChild(summary);
    const fox = document.createElement('span');
    fox.textContent = 'Greg fox model: Quaternius Ultimate Animated Animal Pack · CC0 1.0.';
    const engine = document.createElement('span');
    engine.textContent = 'Runtime: PlayCanvas Engine 2.20.6 · MIT License.';
    const portraits = document.createElement('span');
    portraits.textContent = 'Field Guide portraits: AI-assisted original project artwork · 2026-07-12 · no reference images.';
    const bossPortraits = document.createElement('span');
    bossPortraits.textContent = 'Boss-health portraits: AI-assisted original Forest and Saltwind artwork · 2026-07-12 · no reference images.';
    const original = document.createElement('span');
    original.textContent = 'Procedural heroes, attachments, simulation, UI, and audio presentation: AnimalSurvivor original project work.';
    const status = document.createElement('small');
    status.textContent = 'Local-only save; no telemetry, accounts, cookies, or cloud saves. See the release notice bundle for the complete current record.';
    details.append(fox, engine, portraits, bossPortraits, original, status);
    creditsRoot.appendChild(details);
  }

  function formatFieldGuideDuration(ticks: number): string {
    const seconds = Math.floor(ticks / config.hz);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function renderFieldGuide(): void {
    const entries = profileStore.profile().fieldGuide;
    fieldGuideToggle.textContent = fieldGuideOpen
      ? `Hide Field Guide (${entries.length})`
      : `Field Guide (${entries.length})`;
    fieldGuidePanel.hidden = !fieldGuideOpen;
    fieldGuidePanel.replaceChildren();
    if (!fieldGuideOpen) return;

    const controls = document.createElement('div');
    controls.className = 'field-guide-actions';
    const exportButton = document.createElement('button');
    exportButton.type = 'button';
    exportButton.textContent = 'Export save';
    exportButton.addEventListener('click', () => {
      try {
        const blob = new Blob([profileStore.exportProfile()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'animal-survivor-save.json';
        anchor.click();
        URL.revokeObjectURL(url);
        renderProfile('Save exported as animal-survivor-save.json.');
      } catch {
        renderProfile('Save export is unavailable in this browser.');
      }
    });
    const importButton = document.createElement('button');
    importButton.type = 'button';
    importButton.textContent = 'Import save';
    const importInput = document.createElement('input');
    importInput.type = 'file';
    importInput.accept = 'application/json,.json';
    importInput.hidden = true;
    importInput.addEventListener('change', () => {
      const file = importInput.files?.[0];
      if (file === undefined) return;
      void file.text().then((raw) => {
        try {
          profileStore.importProfile(raw);
          selectedHeroId = profileStore.profile().selectedHeroId;
          renderer.setHero(selectedHeroId);
          if (!runStarted) restartRun();
          renderIntroCopy();
          renderHeroSelection();
          applyPalette();
          renderProfile('Save imported.');
        } catch {
          renderProfile('That save could not be imported; the current save is unchanged.');
        } finally {
          importInput.value = '';
        }
      }).catch(() => renderProfile('That save file could not be read.'));
    });
    importButton.addEventListener('click', () => importInput.click());
    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.textContent = 'Reset save';
    resetButton.addEventListener('click', () => {
      if (!window.confirm('Reset Essence, hero selection, upgrades, and the Field Guide?')) return;
      try {
        profileStore.resetProfile();
        selectedHeroId = 'greg';
        renderer.setHero(selectedHeroId);
        if (!runStarted) restartRun();
        renderIntroCopy();
        renderHeroSelection();
        applyPalette();
        renderProfile('Save reset.');
      } catch {
        renderProfile('Save reset is unavailable in this browser.');
      }
    });
    controls.append(exportButton, importButton, resetButton, importInput);
    fieldGuidePanel.appendChild(controls);

    const glossaryDetails = document.createElement('details');
    glossaryDetails.className = 'field-guide-enemies';
    const glossarySummary = document.createElement('summary');
    glossarySummary.textContent = 'Threat glossary · read the tells and answers';
    glossaryDetails.appendChild(glossarySummary);
    const glossaryHint = document.createElement('span');
    glossaryHint.textContent = 'Every role below is sourced from the same deterministic content manifest that drives spawning.';
    glossaryDetails.appendChild(glossaryHint);
    for (const entry of presentEnemyGlossary()) {
      const line = document.createElement('article');
      const title = document.createElement('strong');
      title.textContent = `${entry.title} · ${entry.threat}`;
      const tell = document.createElement('span');
      tell.textContent = `Tell: ${entry.tell}`;
      const answer = document.createElement('span');
      answer.textContent = `Answer: ${entry.answer}`;
      const spawn = document.createElement('small');
      spawn.textContent = `Spawn: ${entry.spawnLabel}`;
      line.append(title, tell, answer, spawn);
      glossaryDetails.appendChild(line);
    }
    fieldGuidePanel.appendChild(glossaryDetails);

    const recipeDetails = document.createElement('details');
    recipeDetails.className = 'field-guide-recipes';
    const recipeTitle = document.createElement('summary');
    const recipes = presentFieldGuideRecipes(profileStore.profile().discoveredRecipes);
    const discoveredRecipes = recipes.filter((recipe) => recipe.discovered).length;
    recipeTitle.textContent = `Mythic recipe catalog · ${discoveredRecipes}/${recipes.length}`;
    recipeDetails.appendChild(recipeTitle);
    const recipeHint = document.createElement('span');
    recipeHint.textContent = 'Adapt both ingredients in one run to discover a recipe and its presentation palette.';
    recipeDetails.appendChild(recipeHint);
    const recipeList = document.createElement('div');
    recipeList.className = 'field-guide-recipe-list';
    for (const recipe of recipes) {
      const recipeCard = document.createElement('article');
      recipeCard.dataset.discovered = String(recipe.discovered);
      const name = document.createElement('strong');
      name.textContent = `${recipe.discovered ? '✓ Discovered' : 'Locked'} · ${recipe.title}`;
      const ingredients = document.createElement('span');
      ingredients.textContent = `Ingredients: ${recipe.ingredients.join(' + ')}`;
      const state = document.createElement('small');
      state.textContent = recipe.discovered
        ? 'Recorded in the Field Guide.'
        : 'Evolve both Adapted ingredients to discover it.';
      recipeCard.append(name, ingredients, state);
      recipeList.appendChild(recipeCard);
    }
    recipeDetails.appendChild(recipeList);
    fieldGuidePanel.appendChild(recipeDetails);

    const habitatDetails = document.createElement('details');
    habitatDetails.className = 'field-guide-habitats';
    const habitatTitle = document.createElement('summary');
    const habitats = presentFieldGuideHabitats(entries);
    const unlockedHabitats = habitats.filter((habitat) => habitat.unlocked).length;
    habitatTitle.textContent = `Habitat atlas · ${unlockedHabitats}/${HABITAT_IDS.length}`;
    habitatDetails.appendChild(habitatTitle);
    const habitatHint = document.createElement('span');
    habitatHint.textContent = 'Complete runs and archive transformations to map the habitats that shaped the roster.';
    habitatDetails.appendChild(habitatHint);
    const habitatList = document.createElement('div');
    habitatList.className = 'field-guide-habitat-list';
    for (const habitat of habitats) {
      const card = document.createElement('article');
      card.dataset.unlocked = String(habitat.unlocked);
      const name = document.createElement('strong');
      name.textContent = `${habitat.unlocked ? '✓ Discovered' : 'Locked'} · ${habitat.title}`;
      const description = document.createElement('span');
      description.textContent = habitat.description;
      card.append(name, description);
      habitatList.appendChild(card);
    }
    habitatDetails.appendChild(habitatList);
    fieldGuidePanel.appendChild(habitatDetails);

    const challenges = presentFieldGuideChallenges(entries);
    const challengeSummary = document.createElement('div');
    challengeSummary.className = 'field-guide-challenges';
    const challengeTitle = document.createElement('strong');
    const unlockedChallenges = challenges.filter((challenge) => challenge.unlocked).length;
    challengeTitle.textContent = `Field Guide challenges · ${unlockedChallenges}/${CHALLENGE_IDS.length}`;
    challengeSummary.appendChild(challengeTitle);
    const challengeList = document.createElement('div');
    challengeList.className = 'field-guide-challenge-list';
    for (const challenge of challenges) {
      const badge = document.createElement('span');
      badge.dataset.unlocked = String(challenge.unlocked);
      badge.title = challenge.description;
      badge.textContent = challenge.unlocked ? `✓ ${challenge.title}` : `Locked · ${challenge.title}`;
      challengeList.appendChild(badge);
    }
    challengeSummary.appendChild(challengeList);
    fieldGuidePanel.appendChild(challengeSummary);

    if (entries.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'field-guide-empty';
      empty.textContent = 'Complete a run to archive its build and ecology note.';
      fieldGuidePanel.appendChild(empty);
      return;
    }
    for (const entry of entries) {
      const card = document.createElement('article');
      card.className = 'field-guide-entry';
      card.dataset.outcome = entry.outcome;
      const portraitData = presentFieldGuidePortrait(entry);
      const portrait = document.createElement('div');
      portrait.className = 'field-guide-portrait';
      portrait.dataset.portraitKey = portraitData.key;
      portrait.style.setProperty('--portrait-accent', portraitData.accent);
      portrait.setAttribute('aria-label', `${portraitData.title}: ${portraitData.formLabel}`);
      const portraitImage = document.createElement('img');
      portraitImage.className = 'field-guide-portrait-image';
      portraitImage.src = portraitData.assetUrl;
      portraitImage.alt = portraitData.assetAlt;
      portraitImage.loading = 'lazy';
      portraitImage.decoding = 'async';
      const portraitGlyph = document.createElement('strong');
      portraitGlyph.textContent = portraitData.glyph;
      portraitGlyph.hidden = true;
      portraitImage.addEventListener('error', () => {
        portraitImage.hidden = true;
        portraitGlyph.hidden = false;
        portrait.classList.add('field-guide-portrait-fallback');
      }, { once: true });
      const portraitForm = document.createElement('span');
      portraitForm.textContent = portraitData.formLabel;
      portrait.append(portraitImage, portraitGlyph, portraitForm);
      const title = document.createElement('strong');
      title.textContent = entry.buildName;
      const metadata = document.createElement('small');
      const biomeName = entry.biomeId === 'saltwind' ? 'Saltwind Ruins' : 'Forest Arsenal';
      const seedLabel = `0x${entry.seed.toString(16).padStart(8, '0')}`;
      metadata.textContent = `${biomeName} · ${entry.heroId} · seed ${seedLabel} · ${entry.outcome === 'victory' ? 'Victory' : 'Defeat'} · ${formatFieldGuideDuration(entry.durationTicks)} · ${entry.kills} kills · +${entry.essenceEarned} Essence`;
      const note = document.createElement('span');
      note.textContent = entry.ecologyNote;
      card.append(portrait, title, metadata, note);
      const evolutionTree = presentFieldGuideEvolutionTree(entry);
      if (evolutionTree.length > 0) {
        const evolutionDetails = document.createElement('details');
        evolutionDetails.className = 'field-guide-evolution';
        const evolutionSummary = document.createElement('summary');
        evolutionSummary.textContent = `Evolution tree · ${evolutionTree.length} form${evolutionTree.length === 1 ? '' : 's'}`;
        evolutionDetails.appendChild(evolutionSummary);
        for (const node of evolutionTree) {
          const line = document.createElement('span');
          const path = node.steps.map((step) => step.unlocked ? step.label : `Locked ${step.label}`).join(' → ');
          const recipe = node.ingredients.length > 0 ? `${node.ingredients.join(' + ')} → ` : '';
          line.textContent = `${recipe}${node.title}: ${path}`;
          evolutionDetails.appendChild(line);
        }
        card.appendChild(evolutionDetails);
      }
      if (entry.visuals.length > 0) {
        const adaptations = document.createElement('small');
        adaptations.textContent = `Adaptations: ${entry.visuals.map((visual) => visual.sourceId).join(' · ')}`;
        card.appendChild(adaptations);
      }
      const reportButton = document.createElement('button');
      reportButton.type = 'button';
      reportButton.textContent = 'Copy issue report';
      reportButton.addEventListener('click', () => {
        const report = formatFieldGuideIssueReport({
          buildId: BUILD_INFO.buildId,
          runId: entry.id,
          heroId: entry.heroId,
          biomeId: entry.biomeId,
          seed: entry.seed,
          outcome: entry.outcome,
          durationLabel: formatFieldGuideDuration(entry.durationTicks),
          kills: entry.kills,
          buildName: entry.buildName,
          browser: navigator.userAgent.slice(0, 240),
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          qualityTier: accessibilitySettingsStore.settings().qualityTier,
          accessibility: Object.entries(accessibilitySettingsStore.settings())
            .filter(([key, value]) => key !== 'qualityTier' && value === true)
            .map(([key]) => key)
            .join(', ') || 'default',
          inputMode: keyboardInput.inputMode?.() ?? 'keyboard',
          keyboardBindings: Object.entries(keyboardBindingsStore.bindings())
            .map(([direction, key]) => `${direction}=${key.toUpperCase()}`)
            .join(', '),
        });
        const clipboard = navigator.clipboard;
        if (clipboard === undefined) {
          renderProfile('Clipboard access is unavailable; use the displayed run identifiers to report manually.');
          return;
        }
        void clipboard.writeText(report).then(() => {
          reportButton.textContent = 'Report copied';
        }).catch(() => {
          renderProfile('Clipboard access was denied; use the displayed run identifiers to report manually.');
        });
      });
      card.appendChild(reportButton);
      fieldGuidePanel.appendChild(card);
    }
  }

  fieldGuideToggle.addEventListener('click', () => {
    fieldGuideOpen = !fieldGuideOpen;
    renderFieldGuide();
  });

  function renderProfile(message?: string): void {
    if (message !== undefined) profileMessage = message;
    const profile = profileStore.profile();
    const loadout = profileStore.startLoadout();
    const rank = profile.startingVitalityRank;
    const nextCost = rank < STARTING_VITALITY_MAX_RANK ? STARTING_VITALITY_COSTS[rank]! : null;
    const hero = getHeroDefinition(selectedHeroId);
    profileText.textContent = `Essence ${profile.essence} · ${hero.displayName} · Vitality ${rank}/${STARTING_VITALITY_MAX_RANK}`;
    const biomeProgress = profile.unlockedBiomeIds.includes('saltwind')
      ? 'Saltwind Ruins unlocked.'
      : 'Complete a Forest victory to unlock Saltwind Ruins.';
    profileDetail.textContent = profileMessage
      || `Starting HP: hero ${signedInteger(hero.maxHpBonus)} · Vitality ${signedInteger(loadout.maxHpBonus)} · ${biomeProgress}`;
    vitalityButton.disabled = nextCost === null || profile.essence < nextCost;
    vitalityButton.textContent = nextCost === null
      ? 'Starting Vitality: MAX'
      : `Buy +10 starting HP (${nextCost} Essence)`;
    renderPaletteSelection();
    renderFieldGuide();
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
  applyAccessibilitySettings();
  applyPalette();
  renderAccessibilitySettings();
  renderPaletteSelection();
  renderCreditsNotices();
  renderHeroSelection();

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
    renderAudioMixControls();
  }

  function percentage(value: number): string {
    return `${Math.round(value * 100)}%`;
  }

  function renderAudioMixControls(): void {
    const supported = proceduralAudio.supported;
    introAudioMixRoot.hidden = !supported;
    if (!supported) return;
    const mix = proceduralAudio.mix;
    masterVolumeInput.value = String(mix.masterVolume);
    musicVolumeInput.value = String(mix.musicVolume);
    sfxVolumeInput.value = String(mix.sfxVolume);
    masterVolumeValue.value = percentage(mix.masterVolume);
    musicVolumeValue.value = percentage(mix.musicVolume);
    sfxVolumeValue.value = percentage(mix.sfxVolume);
  }

  function setAudioMix(): void {
    try {
      proceduralAudio.setMix({
        masterVolume: Number(masterVolumeInput.value),
        musicVolume: Number(musicVolumeInput.value),
        sfxVolume: Number(sfxVolumeInput.value),
      });
      renderAudioMixControls();
    } catch {
      renderProfile('Audio mix could not be applied in this browser.');
    }
  }

  function setSoundEnabled(enabled: boolean, rememberPreference = true): void {
    if (rememberPreference) soundPreferenceSet = true;
    const wasEnabled = proceduralAudio.enabled;
    const enabledAfterRequest = proceduralAudio.setEnabled(enabled);
    renderSoundControls(enabled && !enabledAfterRequest ? 'Sound couldn’t start; try again.' : null);
    if (!wasEnabled && proceduralAudio.enabled && runStarted) proceduralAudio.play('start');
  }

  function renderRunIntro(): void {
    introRoot.hidden = runStarted;
    renderHeroSelection();
    // The full-screen dialog visually blocks the game, while inert prevents
    // background controls from being reached by keyboard navigation.
    for (const root of introBackgroundRoots) root.toggleAttribute('inert', !runStarted);
    if (!runStarted) focusModalStart(introRoot, introStartButton);
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
    // Browser audio can only begin from this player gesture. Start sound by
    // default, while preserving an explicit pre-run opt-out.
    if (!soundPreferenceSet && proceduralAudio.supported) setSoundEnabled(true, false);
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

  renderIntroCopy();
  introSoundRoot.hidden = !proceduralAudio.supported;
  const onIntroSoundToggle = (): void => setSoundEnabled(introSoundToggle.checked);
  introSoundToggle.addEventListener('change', onIntroSoundToggle);
  const onIntroKeydown = (event: KeyboardEvent): void => {
    if (!runStarted) trapModalFocus(event, introRoot);
  };
  introRoot.addEventListener('keydown', onIntroKeydown);
  masterVolumeInput.addEventListener('input', setAudioMix);
  musicVolumeInput.addEventListener('input', setAudioMix);
  sfxVolumeInput.addEventListener('input', setAudioMix);
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
      const decision = resumeFromVisiblePage(visibilityPauseState);
      visibilityPauseState = decision.state;
      if (decision.resumeNow) setPaused(false);
    } else {
      keyboardInput.clear();
      const decision = pauseForHiddenPage(visibilityPauseState, {
        runStarted,
        runEnded: driver.runOutcome !== null && driver.runOutcome !== 'running',
        upgradeSelectionPending: driver.upgradeSelectionPending,
        paused: controls.paused,
      });
      visibilityPauseState = decision.state;
      if (decision.pauseNow) setPaused(true);
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
    const rendererUnavailable = !renderer.ready;
    // While the GPU context is lost we visibly halt gameplay so the loss can
    // never silently desync or corrupt sim state; sim resumes on restore.
    const runEnded = driver.runOutcome !== null && driver.runOutcome !== 'running';
    const effectivePaused = !runStarted || controls.paused || rendererLost || rendererUnavailable || driver.upgradeSelectionPending || runEnded;

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
    renderInputModeStatus();
    if (stressMode && driver.upgradeSelectionPending) {
      const firstOffer = driver.pendingUpgradeOffers[0];
      if (firstOffer !== undefined) driver.selectUpgrade(firstOffer.id);
    }
    const musicState: MusicState = !runStarted
      ? 'idle'
      : driver.runOutcome === 'victory'
      ? 'victory'
      : driver.runOutcome === 'defeat'
        ? 'defeat'
        : !runStarted
          ? 'idle'
          : driver.runPhase === 'pressure'
            ? 'pressure'
            : driver.runPhase === 'adaptation'
              ? 'adaptation'
              : driver.runPhase === 'mutation'
                ? 'mutation'
                : driver.runPhase === 'boss' || driver.runPhase === 'overtime'
                  ? 'boss'
                  : 'opening';
    proceduralAudio.setMusicState(musicState);
    audioCueRouter.observe({
      tick: driver.tick,
      combatFeedback: driver.combatFeedback,
      traitPresentationEvents: driver.traitPresentationEvents,
      directorEvents: driver.directorEvents,
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
    ctxBanner.style.display = rendererLost || rendererUnavailable ? 'block' : 'none';

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
      renderPlayerHealth();
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
    introRoot.removeEventListener('keydown', onIntroKeydown);
    introStartButton.removeEventListener('click', beginRun);
    introRoot.hidden = true;
    for (const root of introBackgroundRoots) root.toggleAttribute('inert', false);
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
