import { describe, expect, it } from 'vitest';
import { presentUpgrade } from '../src/presentation/upgrade-copy';

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
});
