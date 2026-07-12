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
    expect(coil.description).toMatch(/two charged bolts/i);

    const colony = presentUpgrade({ traitId: 'firefly-colony', resultStage: 'adapted' }, [
      { sourceId: 'electric-eel-coil', stage: 'adapted', sockets: ['tail'], visualKey: 'electric-eel-coil:adapted', enabled: true },
    ]);
    expect(colony.badge).toBe('MYTHIC READY');
    expect(colony.description).toMatch(/Thunderbug Dynamo/);
  });

  it('explains Mantis Scythes as a distinct close-range attack', () => {
    const mantis = presentUpgrade({ traitId: 'mantis-scythes', resultStage: 'bud' }, []);
    expect(mantis).toMatchObject({
      title: 'Mantis Scythes',
      badge: 'NEW ATTACK',
      socket: 'Left shoulder attachment',
    });
    expect(mantis.description).toMatch(/close-range damaging pulse/i);

    const adapted = presentUpgrade({ traitId: 'mantis-scythes', resultStage: 'adapted' }, []);
    expect(adapted.description).toMatch(/wider area/i);
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
