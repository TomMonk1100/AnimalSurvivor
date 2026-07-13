import { RUN_ENEMY_CONTENT, type RunEnemyContentDefinition } from '@sim';

export interface EnemyGlossaryEntry {
  readonly id: string;
  readonly title: string;
  readonly behavior: string;
  readonly threat: string;
  readonly tell: string;
  readonly answer: string;
  readonly spawnLabel: string;
}

interface EnemyGlossaryCopy {
  readonly title: string;
  readonly threat: string;
  readonly tell: string;
  readonly answer: string;
}

const COPY: Readonly<Record<string, EnemyGlossaryCopy>> = Object.freeze({
  'enemy:fodder': Object.freeze({
    title: 'Fodder',
    threat: 'Basic swarm pressure',
    tell: 'A steady arc of small threats closes from the edge.',
    answer: 'Keep moving and let automatic fire thin the pack.',
  }),
  'enemy:runner': Object.freeze({
    title: 'Runner',
    threat: 'Fast weaving contact',
    tell: 'It zigzags at range, then commits to a direct approach.',
    answer: 'Turn across its path; short movement changes break the lane.',
  }),
  'enemy:brute': Object.freeze({
    title: 'Brute',
    threat: 'Armored high-health pressure',
    tell: 'A heavy silhouette advances slowly with a large health pool.',
    answer: 'Prioritize it before the pack compresses around you.',
  }),
  'enemy:spitter': Object.freeze({
    title: 'Spitter',
    threat: 'Ranged hostile shots',
    tell: 'It holds distance and fires a visible projectile cadence.',
    answer: 'Keep a clear escape lane and remove it when safe.',
  }),
  'enemy:charger': Object.freeze({
    title: 'Charger',
    threat: 'Telegraphed lunge',
    tell: 'A wind-up warns before its fast burst toward your position.',
    answer: 'Read the warning, sidestep the line, then counterattack.',
  }),
  'enemy:denial': Object.freeze({
    title: 'Denial',
    threat: 'Spacing and area pressure',
    tell: 'It prefers a wide band and threatens the space you need to cross.',
    answer: 'Avoid getting pinned; use a gap or a knockback effect.',
  }),
  'enemy:flanker': Object.freeze({
    title: 'Flanker',
    threat: 'Lateral ambush pressure',
    tell: 'It orbits rather than approaching on the obvious center line.',
    answer: 'Watch both sides of the screen and keep rotating your escape route.',
  }),
  'enemy:support': Object.freeze({
    title: 'Support',
    threat: 'Pack healing and formation pressure',
    tell: 'It stays behind nearby threats and periodically restores their health.',
    answer: 'Break through to it or focus it before grinding down the pack.',
  }),
  'enemy:elite': Object.freeze({
    title: 'Elite',
    threat: 'Rewarded ranged pressure',
    tell: 'A warning precedes a tougher enemy with a larger XP drop.',
    answer: 'Treat the warning as a priority callout and claim the reward safely.',
  }),
  'enemy:boss': Object.freeze({
    title: 'Apex threat',
    threat: 'Final encounter pressure',
    tell: 'A long warning precedes charge and radial-volley attack phases.',
    answer: 'Save space, read telegraphs, and survive the full boss runway.',
  }),
});

function presentEntry(content: RunEnemyContentDefinition): EnemyGlossaryEntry {
  const copy = COPY[content.archetypeId];
  if (copy === undefined) throw new Error(`Missing enemy glossary copy for ${content.archetypeId}`);
  return Object.freeze({
    id: content.archetypeId,
    title: copy.title,
    behavior: content.behavior,
    threat: copy.threat,
    tell: copy.tell,
    answer: copy.answer,
    spawnLabel: `${content.spawn.formation} × ${content.spawn.count}`,
  });
}

/** Stable, authored order matching the deterministic run content manifest. */
export function presentEnemyGlossary(): readonly EnemyGlossaryEntry[] {
  return Object.freeze(RUN_ENEMY_CONTENT.map(presentEntry));
}

export function validateEnemyGlossary(): void {
  const entries = presentEnemyGlossary();
  if (entries.length !== RUN_ENEMY_CONTENT.length) {
    throw new Error('enemy glossary must cover every authored content entry');
  }
  const ids = new Set(entries.map((entry) => entry.id));
  if (ids.size !== entries.length) throw new Error('enemy glossary contains duplicate content ids');
}

validateEnemyGlossary();
