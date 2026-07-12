import { describe, expect, it } from 'vitest';
import { presentRunUpgrade, presentUpgrade } from '../src/presentation/upgrade-copy';

describe('upgrade card copy', () => {
  it('explains Greg Bud attachments and their sockets', () => {
    const quills = presentUpgrade({ traitId: 'porcupine-quills', resultStage: 'bud' }, []);
    expect(quills).toMatchObject({ badge: 'NEW', socket: 'Back attachment' });
    expect(quills.description).toMatch(/Automatically fires/);
    expect(quills.pairingHint).toMatch(/Puffer Pouch/);
  });

  it('marks the second Adapted ingredient as an immediate Mythic', () => {
    const pouch = presentUpgrade({ traitId: 'puffer-pouch', resultStage: 'adapted' }, [
      { sourceId: 'porcupine-quills', stage: 'adapted', sockets: ['back'], visualKey: 'porcupine-quills:adapted', enabled: true },
    ]);
    expect(pouch.badge).toBe('MYTHIC READY');
    expect(pouch.description).toMatch(/Thornstorm Mantle/);
  });

  it('explains the second attack pair and its Thunderbug evolution', () => {
    const coil = presentUpgrade({ traitId: 'electric-eel-coil', resultStage: 'bud' }, []);
    expect(coil).toMatchObject({ title: 'Electric Eel Coil', badge: 'NEW ATTACK', socket: 'Tail attachment' });
    expect(coil.description).toBe('Instantly strikes the nearest enemy, then chains to 1 nearby unhit foe.');

    const adaptedCoil = presentUpgrade({ traitId: 'electric-eel-coil', resultStage: 'adapted' }, []);
    expect(adaptedCoil.description).toBe('Instantly strikes the nearest enemy, then chains to 3 nearby unhit foes.');

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

  it('describes truthful neutral and Essence fallback cards without pretending they are body traits', () => {
    expect(presentRunUpgrade({
      kind: 'universal', id: 'universal:xp-magnet', upgradeId: 'xp-magnet', currentRank: 1, nextRank: 2, maxRank: 5,
    }, [])).toMatchObject({
      title: 'XP Magnet', badge: 'RANK 2/5', socket: 'Neutral run upgrade',
      description: expect.stringContaining('pull XP motes'),
    });
    expect(presentRunUpgrade({ kind: 'essence', id: 'essence-cache', amount: 5 }, [])).toMatchObject({
      title: 'Essence Cache', badge: '+5 ESSENCE', socket: 'Permanent progression',
    });
  });
});
