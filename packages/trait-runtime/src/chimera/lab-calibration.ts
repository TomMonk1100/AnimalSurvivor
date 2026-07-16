/**
 * Measured Wild Splice correction layer.
 *
 * `solveChimeraBudget` first normalizes a synthesized command shape with its
 * closed-form estimator. These values then correct the remaining executor and
 * contact-geometry difference measured by Chimera Lab v2: the real
 * TraitRuntime -> Simulation twenty-second Steady/Balanced sweep. Keeping the
 * correction here makes the last-mile tuning explicit, deterministic, and
 * replay-fingerprinted instead of hiding it in presentation or test thresholds.
 *
 * Regenerate deliberately after a command-executor, Master-DPS, or training
 * fixture change; the corresponding fingerprint invalidates old replays.
 */

export const CHIMERA_LAB_CALIBRATION_VERSION = 2 as const;

/** Pair-order independent, post-estimator multiplier measured from Lab v2. */
export const CHIMERA_LAB_CALIBRATION = Object.freeze({
  'porcupine-quills+puffer-pouch': 3.384639,
  // The Colossus/Reaching boss lane exposed that the dense-dummy calibration
  // alone underweights Static Acupuncture's slower single-target schedule.
  // This measured local correction keeps its real full-run boss time inside
  // the authored 45–65-second boss-time envelope without global boss tuning.
  'porcupine-quills+electric-eel-coil': 0.548491,
  'porcupine-quills+firefly-colony': 0.563184,
  'porcupine-quills+mantis-scythes': 0.954135,
  'porcupine-quills+gecko-pads': 0.478095,
  'porcupine-quills+owl-pinions': 0.580767,
  'porcupine-quills+bat-ears': 0.647063,
  'porcupine-quills+crab-pincers': 0.703320,
  'porcupine-quills+armadillo-greaves': 4.455728,
  'porcupine-quills+skunk-brush': 0.441903,
  'porcupine-quills+monarch-brood': 0.700092,
  'puffer-pouch+electric-eel-coil': 0.750000,
  'puffer-pouch+firefly-colony': 1.250000,
  'puffer-pouch+mantis-scythes': 1.001685,
  'puffer-pouch+gecko-pads': 0.425778,
  'puffer-pouch+owl-pinions': 5.828434,
  'puffer-pouch+bat-ears': 0.652385,
  'puffer-pouch+crab-pincers': 0.650000,
  'puffer-pouch+armadillo-greaves': 0.652385,
  'puffer-pouch+skunk-brush': 0.218966,
  'puffer-pouch+monarch-brood': 0.252536,
  'electric-eel-coil+firefly-colony': 1.232143,
  'electric-eel-coil+mantis-scythes': 1.293342,
  'electric-eel-coil+gecko-pads': 0.163255,
  'electric-eel-coil+owl-pinions': 1.297008,
  'electric-eel-coil+bat-ears': 1.260332,
  'electric-eel-coil+crab-pincers': 0.672325,
  'electric-eel-coil+armadillo-greaves': 1.239633,
  'electric-eel-coil+skunk-brush': 0.124159,
  'electric-eel-coil+monarch-brood': 1.269715,
  'firefly-colony+mantis-scythes': 1.035588,
  'firefly-colony+gecko-pads': 0.373573,
  'firefly-colony+owl-pinions': 1.236433,
  'firefly-colony+bat-ears': 1.250000,
  'firefly-colony+crab-pincers': 0.585200,
  'firefly-colony+armadillo-greaves': 1.250000,
  'firefly-colony+skunk-brush': 0.193148,
  'firefly-colony+monarch-brood': 1.250000,
  'mantis-scythes+gecko-pads': 0.994291,
  'mantis-scythes+owl-pinions': 1.104845,
  'mantis-scythes+bat-ears': 1.066774,
  'mantis-scythes+crab-pincers': 0.981979,
  'mantis-scythes+armadillo-greaves': 2.345307,
  'mantis-scythes+skunk-brush': 0.194459,
  'mantis-scythes+monarch-brood': 1.250000,
  'gecko-pads+owl-pinions': 1.193651,
  'gecko-pads+bat-ears': 0.425778,
  'gecko-pads+crab-pincers': 0.432143,
  'gecko-pads+armadillo-greaves': 0.425778,
  'gecko-pads+skunk-brush': 0.283893,
  'gecko-pads+monarch-brood': 0.425778,
  'owl-pinions+bat-ears': 0.188752,
  'owl-pinions+crab-pincers': 0.761671,
  'owl-pinions+armadillo-greaves': 1.493602,
  'owl-pinions+skunk-brush': 1.238680,
  'owl-pinions+monarch-brood': 1.129133,
  'bat-ears+crab-pincers': 0.644841,
  'bat-ears+armadillo-greaves': 0.824066,
  'bat-ears+skunk-brush': 0.218966,
  'bat-ears+monarch-brood': 0.240881,
  'crab-pincers+armadillo-greaves': 0.967262,
  'crab-pincers+skunk-brush': 0.224722,
  'crab-pincers+monarch-brood': 0.650000,
  'armadillo-greaves+skunk-brush': 0.217750,
  'armadillo-greaves+monarch-brood': 0.246571,
  'skunk-brush+monarch-brood': 0.509026,
} as const);

export type ChimeraLabCalibrationPair = keyof typeof CHIMERA_LAB_CALIBRATION;

/** Never depend on catalog order for a correction lookup. */
export function chimeraLabCalibrationMultiplier(traitA: string, traitB: string): number {
  const forward = `${traitA}+${traitB}` as ChimeraLabCalibrationPair;
  const reverse = `${traitB}+${traitA}` as ChimeraLabCalibrationPair;
  return CHIMERA_LAB_CALIBRATION[forward] ?? CHIMERA_LAB_CALIBRATION[reverse] ?? 1;
}

/**
 * Measured timing correction after the damage correction above. Values below
 * one accelerate a loop; values above one slow it. This controls saturated
 * low-health-dummy cases through real command cadence instead of pretending a
 * larger damage number can exceed an enemy's remaining hit points.
 */
export const CHIMERA_LAB_CADENCE_CALIBRATION = Object.freeze({
  'porcupine-quills+puffer-pouch': 0.376000,
  'porcupine-quills+electric-eel-coil': 1.150000,
  'porcupine-quills+firefly-colony': 1.018575,
  'porcupine-quills+mantis-scythes': 1.048069,
  'porcupine-quills+gecko-pads': 1.026953,
  'porcupine-quills+owl-pinions': 1.501607,
  'porcupine-quills+bat-ears': 0.979710,
  'porcupine-quills+crab-pincers': 1.421828,
  'porcupine-quills+armadillo-greaves': 0.224430,
  'porcupine-quills+skunk-brush': 0.993379,
  'porcupine-quills+monarch-brood': 1.055204,
  'puffer-pouch+electric-eel-coil': 0.750000,
  'puffer-pouch+firefly-colony': 0.800000,
  'puffer-pouch+mantis-scythes': 0.998318,
  'puffer-pouch+gecko-pads': 2.348643,
  'puffer-pouch+owl-pinions': 1.000000,
  'puffer-pouch+bat-ears': 1.532836,
  'puffer-pouch+crab-pincers': 1.538462,
  'puffer-pouch+armadillo-greaves': 1.532836,
  'puffer-pouch+skunk-brush': 4.566909,
  'puffer-pouch+monarch-brood': 2.327197,
  'electric-eel-coil+firefly-colony': 0.811594,
  'electric-eel-coil+mantis-scythes': 0.773191,
  'electric-eel-coil+gecko-pads': 0.633000,
  'electric-eel-coil+owl-pinions': 1.006311,
  'electric-eel-coil+bat-ears': 1.169231,
  'electric-eel-coil+crab-pincers': 1.487375,
  'electric-eel-coil+armadillo-greaves': 1.146664,
  'electric-eel-coil+skunk-brush': 1.097247,
  'electric-eel-coil+monarch-brood': 1.169231,
  'firefly-colony+mantis-scythes': 0.965635,
  'firefly-colony+gecko-pads': 2.676856,
  'firefly-colony+owl-pinions': 1.176543,
  'firefly-colony+bat-ears': 0.800000,
  'firefly-colony+crab-pincers': 1.708817,
  'firefly-colony+armadillo-greaves': 0.800000,
  'firefly-colony+skunk-brush': 5.177382,
  'firefly-colony+monarch-brood': 0.800000,
  'mantis-scythes+gecko-pads': 1.005742,
  'mantis-scythes+owl-pinions': 0.905104,
  'mantis-scythes+bat-ears': 0.937406,
  'mantis-scythes+crab-pincers': 1.018352,
  'mantis-scythes+armadillo-greaves': 0.426383,
  'mantis-scythes+skunk-brush': 5.142475,
  'mantis-scythes+monarch-brood': 0.800000,
  'gecko-pads+owl-pinions': 1.780000,
  'gecko-pads+bat-ears': 2.348643,
  'gecko-pads+crab-pincers': 2.314050,
  'gecko-pads+armadillo-greaves': 2.348643,
  'gecko-pads+skunk-brush': 3.522460,
  'gecko-pads+monarch-brood': 2.348643,
  'owl-pinions+bat-ears': 2.445216,
  'owl-pinions+crab-pincers': 1.312902,
  'owl-pinions+armadillo-greaves': 0.919316,
  'owl-pinions+skunk-brush': 2.053000,
  'owl-pinions+monarch-brood': 0.907082,
  'bat-ears+crab-pincers': 1.550769,
  'bat-ears+armadillo-greaves': 1.213495,
  'bat-ears+skunk-brush': 4.566909,
  'bat-ears+monarch-brood': 2.225706,
  'crab-pincers+armadillo-greaves': 1.033846,
  'crab-pincers+skunk-brush': 4.449945,
  'crab-pincers+monarch-brood': 1.538462,
  'armadillo-greaves+skunk-brush': 4.592423,
  'armadillo-greaves+monarch-brood': 2.195469,
  'skunk-brush+monarch-brood': 1.964536,
} as const);

/** Never depend on catalog order for a timing correction lookup. */
export function chimeraLabCadenceMultiplier(traitA: string, traitB: string): number {
  const forward = `${traitA}+${traitB}` as keyof typeof CHIMERA_LAB_CADENCE_CALIBRATION;
  const reverse = `${traitB}+${traitA}` as keyof typeof CHIMERA_LAB_CADENCE_CALIBRATION;
  return CHIMERA_LAB_CADENCE_CALIBRATION[forward] ?? CHIMERA_LAB_CADENCE_CALIBRATION[reverse] ?? 1;
}

/** Stable generated-content input consumed by the runtime/replay fingerprint. */
export const CHIMERA_LAB_CALIBRATION_FINGERPRINT_INPUT = [
  `v${CHIMERA_LAB_CALIBRATION_VERSION}`,
  ...Object.entries(CHIMERA_LAB_CALIBRATION).map(([pairId, multiplier]) => `damage:${pairId}:${multiplier}`),
  ...Object.entries(CHIMERA_LAB_CADENCE_CALIBRATION).map(([pairId, multiplier]) => `cadence:${pairId}:${multiplier}`),
].join('|');
