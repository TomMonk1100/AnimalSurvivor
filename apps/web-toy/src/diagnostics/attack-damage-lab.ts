/**
 * Developer-only presentation for the deterministic combat proof harness.
 * The harness itself belongs to @animalsurvivor/sim; this module only turns its
 * immutable report into an inspectable table and never observes or mutates a
 * live run.
 */

export interface AttackDamageProofRow {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly durationTicks: number;
  readonly hz: number;
  readonly totalDamage: number;
  readonly kills: number;
  readonly hitCount: number;
  /** `confirmed` means this case produced real damage in the lab. */
  readonly status: string;
  /** Context for intentional non-damaging support effects or a failed case. */
  readonly note?: string;
}

function whole(value: number): string {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)).toLocaleString() : '—';
}

function seconds(row: AttackDamageProofRow): string {
  if (!Number.isFinite(row.durationTicks) || !Number.isFinite(row.hz) || row.hz <= 0) return '—';
  const value = row.durationTicks / row.hz;
  return Number.isInteger(value) ? `${value}s` : `${value.toFixed(1)}s`;
}

function isConfirmed(row: AttackDamageProofRow): boolean {
  return row.status === 'confirmed' || row.status === 'damage-confirmed';
}

function statusLabel(row: AttackDamageProofRow): string {
  if (isConfirmed(row)) return 'Damage confirmed';
  if (row.status === 'utility' || row.status === 'utility-only') return 'Utility only';
  return 'Needs attention';
}

/** Human-readable one-line result, useful in tests and issue reports. */
export function formatAttackDamageProof(row: AttackDamageProofRow): string {
  return `${row.title}: ${statusLabel(row)} · ${whole(row.totalDamage)} damage · ${whole(row.kills)} kills · ${whole(row.hitCount)} hits · ${seconds(row)}`;
}

/** Build a static developer panel from one already-computed deterministic run. */
export function createAttackDamageLabPanel(
  root: HTMLElement,
  rows: readonly AttackDamageProofRow[],
): HTMLElement {
  const panel = document.createElement('details');
  panel.className = 'attack-damage-lab';
  panel.open = true;
  panel.dataset.caseCount = String(rows.length);
  const confirmed = rows.filter(isConfirmed).length;
  const utilityConfirmed = rows.filter((row) => (
    row.status === 'utility' || row.status === 'utility-only'
  )).length;
  const needsAttention = rows.length - confirmed - utilityConfirmed;
  panel.dataset.confirmedCount = String(confirmed);
  panel.dataset.utilityCount = String(utilityConfirmed);
  panel.dataset.attentionCount = String(needsAttention);

  const summary = document.createElement('summary');
  summary.textContent = `Attack proof lab · ${confirmed} damaging + ${utilityConfirmed} utility cases confirmed`;
  const intro = document.createElement('p');
  intro.textContent = 'Each row is a separate deterministic 20-second run against weak nearby targets. Damage and kills are authoritative simulation totals.';
  const table = document.createElement('table');
  table.setAttribute('aria-label', 'Deterministic attack damage proof results');
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const label of ['Attack', 'Result', 'Damage', 'Kills', 'Hits', 'Time']) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = label;
    headRow.appendChild(cell);
  }
  head.appendChild(headRow);
  const body = document.createElement('tbody');
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.dataset.attackId = row.id;
    tr.dataset.status = row.status;
    const attack = document.createElement('th');
    attack.scope = 'row';
    const title = document.createElement('strong');
    title.textContent = row.title;
    const category = document.createElement('small');
    category.textContent = row.category;
    attack.append(title, category);
    const result = document.createElement('td');
    result.textContent = statusLabel(row);
    result.title = row.note ?? '';
    const damage = document.createElement('td');
    damage.textContent = whole(row.totalDamage);
    const kills = document.createElement('td');
    kills.textContent = whole(row.kills);
    const hits = document.createElement('td');
    hits.textContent = whole(row.hitCount);
    const duration = document.createElement('td');
    duration.textContent = seconds(row);
    tr.append(attack, result, damage, kills, hits, duration);
    body.appendChild(tr);
  }
  table.append(head, body);
  const note = document.createElement('p');
  note.className = 'attack-damage-lab-note';
  note.textContent = needsAttention > 0
    ? `${needsAttention} case${needsAttention === 1 ? '' : 's'} need review before a release candidate.`
    : 'All direct-damage cases are confirmed. Utility-only rows intentionally do not deal direct damage.';
  panel.append(summary, intro, table, note);
  root.appendChild(panel);
  return panel;
}
