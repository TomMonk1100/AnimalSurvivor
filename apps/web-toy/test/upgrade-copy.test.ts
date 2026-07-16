import { describe, expect, it } from 'vitest';
import { getUniversalUpgradeCatalogForHero } from '@sim';
import {
  presentRunUpgrade,
  presentUpgrade,
  presentUpgradeConfirmation,
} from '../src/presentation/upgrade-copy';

describe('upgrade card copy', () => {
  it('explains Greg Bud attachments and their sockets', () => {
    const quills = presentUpgrade({ traitId: 'porcupine-quills', resultStage: 'bud' }, []);
    expect(quills).toMatchObject({ badge: 'NEW', socket: 'Back attachment' });
    expect(quills.description).toMatch(/pierce/i);
    expect(quills.pairingHint).toMatch(/Puffer Pouch/);
  });

  it('marks the second Adapted ingredient as an immediate Mythic', () => {
    const pouch = presentUpgrade({ traitId: 'puffer-pouch', resultStage: 'adapted' }, [
      { sourceId: 'porcupine-quills', stage: 'adapted', sockets: ['back'], visualKey: 'porcupine-quills:adapted', enabled: true },
    ]);
    expect(pouch.badge).toBe('MYTHIC READY');
    expect(pouch.description).toMatch(/Thornstorm Mantle/);
  });

  it('uses exact V1.1 ranks and makes Master fusion an explicit free action', () => {
    const rankThree = presentUpgrade({
      traitId: 'porcupine-quills', resultStage: 'adapted', resultRank: 3, isMaster: false,
    }, []);
    expect(rankThree.badge).toBe('Rank 3/5');
    expect(rankThree.pairingHint).toMatch(/Master Puffer Pouch.*free Fuse now/i);

    const master = presentUpgrade({
      traitId: 'porcupine-quills', resultStage: 'adapted', resultRank: 5, isMaster: true,
    }, [{
      sourceId: 'puffer-pouch', stage: 'adapted', rank: 5, isMaster: true, logicalSlotCost: 1,
      sockets: ['head'], visualKey: 'puffer-pouch:adapted', enabled: true,
    }]);
    expect(master.badge).toBe('MASTER · Rank 5/5 · FUSION READY');
    expect(master.description).toMatch(/^Ready to fuse into Thornstorm Mantle/);
    expect(master.pairingHint).toBeNull();
  });

  it('explains the second attack pair and its Thunderbug evolution', () => {
    const coil = presentUpgrade({ traitId: 'electric-eel-coil', resultStage: 'bud' }, []);
    expect(coil).toMatchObject({ title: 'Electric Eel Coil', badge: 'NEW ATTACK', socket: 'Tail attachment' });
    expect(coil.description).toBe('Instantly strikes the nearest enemy, then chains to 1 nearby unhit foe.');

    const adaptedCoil = presentUpgrade({ traitId: 'electric-eel-coil', resultStage: 'adapted' }, []);
    expect(adaptedCoil.description).toBe('Instantly strikes the nearest enemy, then chains to 3 nearby unhit foes.');

    const firefly = presentUpgrade({ traitId: 'firefly-colony', resultStage: 'bud' }, []);
    expect(firefly.description).toMatch(/orbit Greg.*touch/i);

    const colony = presentUpgrade({ traitId: 'firefly-colony', resultStage: 'adapted' }, [
      { sourceId: 'electric-eel-coil', stage: 'adapted', sockets: ['tail'], visualKey: 'electric-eel-coil:adapted', enabled: true },
    ]);
    expect(colony.badge).toBe('MYTHIC READY');
    expect(colony.description).toMatch(/Thunderbug Dynamo/);
  });

  it('explains Mantis Scythes as a distinct auto-aimed directional attack', () => {
    const mantis = presentUpgrade({ traitId: 'mantis-scythes', resultStage: 'bud' }, []);
    expect(mantis).toMatchObject({
      title: 'Mantis Scythes',
      badge: 'NEW ATTACK',
      socket: 'Left shoulder attachment',
    });
    expect(mantis.description).toMatch(/auto-aims a narrow scythe sweep/i);

    const adapted = presentUpgrade({ traitId: 'mantis-scythes', resultStage: 'adapted' }, []);
    expect(adapted.description).toMatch(/auto-aims a wider.*scythe sweep/i);
  });

  it('explains Gecko Pads as damaging movement trails and advertises Razorstep', () => {
    const gecko = presentUpgrade({ traitId: 'gecko-pads', resultStage: 'bud' }, []);
    expect(gecko).toMatchObject({
      title: 'Gecko Pads',
      badge: 'NEW ATTACK',
      socket: 'Right shoulder attachment',
      description: "After moving, leaves a damaging pad at Greg's feet.",
    });
    expect(gecko.description).not.toMatch(/slow/i);
    expect(gecko.pairingHint).toMatch(/Mantis Scythes/);

    const geckoReady = presentUpgrade({ traitId: 'gecko-pads', resultStage: 'adapted' }, [
      { sourceId: 'mantis-scythes', stage: 'adapted', sockets: ['leftShoulder'], visualKey: 'mantis-scythes:adapted', enabled: true },
    ]);
    expect(geckoReady).toMatchObject({
      badge: 'MYTHIC READY',
      description: "Completes Razorstep Chimera: movement leaves stronger scythe pads at Greg's feet.",
      pairingHint: null,
    });

    const mantisReady = presentUpgrade({ traitId: 'mantis-scythes', resultStage: 'adapted' }, [
      { sourceId: 'gecko-pads', stage: 'adapted', sockets: ['rightShoulder'], visualKey: 'gecko-pads:adapted', enabled: true },
    ]);
    expect(mantisReady).toMatchObject({
      badge: 'MYTHIC READY',
      description: "Completes Razorstep Chimera: movement leaves stronger scythe pads at Greg's feet.",
      pairingHint: null,
    });
  });

  it('states the real Bat priority and Monarch contact-damage behavior', () => {
    const bat = presentUpgrade({ traitId: 'bat-ears', resultStage: 'bud' }, []);
    const monarch = presentUpgrade({ traitId: 'monarch-brood', resultStage: 'bud' }, []);

    expect(bat.description).toMatch(/every automatic attack prioritizes/i);
    expect(monarch).toMatchObject({ title: 'Monarch Brood', badge: 'NEW' });
    expect(monarch.description).toMatch(/orbit Greg.*contact/i);
  });

  it('describes truthful neutral and Essence fallback cards without pretending they are body traits', () => {
    expect(presentRunUpgrade({
      kind: 'universal', id: 'universal:xp-magnet', upgradeId: 'xp-magnet', currentRank: 1, nextRank: 2, maxRank: 5,
    }, [])).toMatchObject({
      title: 'Mote Draw', badge: 'RANK 2/5', socket: 'Neutral run upgrade',
      description: expect.stringContaining('pull XP motes'),
    });
    expect(presentRunUpgrade({ kind: 'essence', id: 'essence-cache', amount: 5 }, [])).toMatchObject({
      title: 'Essence Cache', badge: '+5 ESSENCE', socket: 'Permanent progression',
    });
    const scoutMastery = presentRunUpgrade({
      kind: 'universal', id: 'universal:basic-attack:greg-precision',
      upgradeId: 'basic-attack:greg-precision', currentRank: 1, nextRank: 2, maxRank: 5,
    }, [], 'Scout', getUniversalUpgradeCatalogForHero('greg'));
    expect(scoutMastery).toMatchObject({
      title: "Pouncer's Precision", badge: 'RANK 2/5', socket: 'Starter mastery',
      description: expect.stringContaining('Scout Swipe'),
    });
    expect(scoutMastery.description).not.toMatch(/Fox/);
    expect(presentRunUpgrade({
      kind: 'universal', id: 'universal:basic-attack:benny-brace-burst',
      upgradeId: 'basic-attack:benny-brace-burst', currentRank: 1, nextRank: 2, maxRank: 5,
    }, [], 'Benny', getUniversalUpgradeCatalogForHero('benny'))).toMatchObject({
      title: 'Trample Mastery', badge: 'RANK 2/5', socket: 'Starter mastery',
      description: expect.stringContaining('earth waves'),
    });
  });

  it('shows exact rank transitions and labels direct versus utility outcomes truthfully', () => {
    const quills = presentUpgrade({
      traitId: 'porcupine-quills', resultStage: 'adapted', resultRank: 3, isMaster: false,
    }, []);
    expect(quills).toMatchObject({ impactCategory: 'Direct damage' });
    expect(quills.impact).toMatch(/Rank 2 → 3/);
    expect(quills.impact).toMatch(/damage/i);

    const puffer = presentUpgrade({
      traitId: 'puffer-pouch', resultStage: 'adapted', resultRank: 2, isMaster: false,
    }, []);
    expect(puffer).toMatchObject({ impactCategory: 'Crowd control' });
    expect(puffer.impact).toMatch(/no direct damage/i);

    const instinct = presentRunUpgrade({
      kind: 'universal', id: 'universal:sharpened-instinct', upgradeId: 'sharpened-instinct', currentRank: 1, nextRank: 2, maxRank: 5,
    }, []);
    expect(instinct).toMatchObject({ impactCategory: 'Direct damage' });
    expect(instinct.impact).toMatch(/Rank 1 → 2/);
    expect(instinct.impact).toMatch(/\+12% all attack damage/i);

    expect(presentUpgradeConfirmation(puffer)).toEqual({
      title: 'Puffer Pouch applied',
      category: 'Crowd control',
      detail: puffer.impact,
    });
  });
});
