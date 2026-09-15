// Three-way merge for independent edits from two tabs. A simultaneous edit to
// the same item is deliberately not guessed at: the caller must keep a backup.
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const CONFLICT = Symbol('conflict');

function changed(base, local, remote) {
  if (same(local, remote)) return local;
  if (same(local, base)) return remote;
  if (same(remote, base)) return local;
  return CONFLICT;
}

function mergeItems(base = [], local = [], remote = []) {
  const old = new Map(base.map(item => [item.id, item]));
  const mine = new Map(local.map(item => [item.id, item]));
  const theirs = new Map(remote.map(item => [item.id, item]));
  const merged = [];
  for (const id of new Set([...old.keys(), ...theirs.keys(), ...mine.keys()])) {
    const item = changed(old.get(id), mine.get(id), theirs.get(id));
    if (item === CONFLICT) return null;
    if (item !== undefined) merged.push(item);
  }
  return merged;
}

export function mergeJournal(base, local, remote) {
  const b = base || {}, l = local || {}, r = remote || {};
  const profile = changed(b.profile ?? null, l.profile ?? null, r.profile ?? null);
  if (profile === CONFLICT) return null;
  const records = mergeItems(b.records, l.records, r.records);
  const conversations = mergeItems(b.conversations, l.conversations, r.conversations);
  const savedAnswers = mergeItems(b.savedAnswers, l.savedAnswers, r.savedAnswers);
  if (!records || !conversations || !savedAnswers) return null;
  return { profile, records, conversations, savedAnswers };
}
