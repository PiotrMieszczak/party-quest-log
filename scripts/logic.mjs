// Pure rules — no Foundry globals, so node --test can import this file.

export const MODULE_ID = "party-quest-log";
export const QUEST_TYPE = `${MODULE_ID}.quest`;

// Order = tab order in the Quest Log.
export const STATUSES = {
  active: { label: "PQL.Status.active", tab: "PQL.Tab.active", icon: "fa-compass" },
  done: { label: "PQL.Status.done", tab: "PQL.Tab.done", icon: "fa-check" },
  failed: { label: "PQL.Status.failed", tab: "PQL.Tab.failed", icon: "fa-xmark" },
  hook: { label: "PQL.Status.hook", tab: "PQL.Tab.hook", icon: "fa-scroll" }
};

export const CATEGORIES = { main: "PQL.Category.main", side: "PQL.Category.side", personal: "PQL.Category.personal" };

export const REWARD_KINDS = {
  item: { label: "PQL.Reward.item", icon: "fa-gem" },
  currency: { label: "PQL.Reward.currency", icon: "fa-coins" },
  xp: { label: "PQL.Reward.xp", icon: "fa-star" },
  text: { label: "PQL.Reward.text", icon: "fa-handshake" }
};

/**
 * Single source of permission rules. UI-level only: owners can technically write any field (DESIGN D2).
 * @param {{isGM: boolean, isOwner: boolean, userId: string}} who
 * @param {string} action
 * @param {object} [entry] the objective / note / reward / quest system the action targets
 */
export function canDo(who, action, entry) {
  // State-based actions apply to the GM too: only hooks can be taken on; the GM hands out items by dragging.
  if (action === "accept" && entry?.status !== "hook") return false;
  if (action === "claim" && who.isGM) return false;
  if (who.isGM) return true;
  if (!who.isOwner) return false;
  switch (action) {
    case "tick":
    case "add":
    case "note": return true;
    case "editObjective": return !!entry && entry.createdBy === who.userId;
    case "editNote": return !!entry && entry.author === who.userId;
    case "accept": return entry?.status === "hook";
    case "claim": return !!entry && entry.revealed && !entry.claimedBy;
    default: return false; // "edit": status, info, story log, rewards, hiding — GM only
  }
}

/** Keyed-object entries as [id, entry] sorted by `sort`, then id for stability. */
export function sortedEntries(obj = {}) {
  return Object.entries(obj).sort(([a, x], [b, y]) => ((x.sort ?? 0) - (y.sort ?? 0)) || a.localeCompare(b));
}

export function nextSort(obj = {}) {
  return Object.values(obj).reduce((m, o) => Math.max(m, o.sort ?? 0), -1) + 1;
}

/**
 * Objectives in display order: each top-level step followed by its sub-steps (one level).
 * A step whose parent is missing, hidden from this viewer, or itself a sub-step shows as top-level.
 * Marks the first open, non-optional step as `isNext`.
 */
export function orderObjectives(objectives = {}, { showHidden = false } = {}) {
  const list = sortedEntries(objectives).filter(([, o]) => showHidden || !o.hidden);
  const ids = new Set(list.map(([id]) => id));
  const isChild = o => !!o.parent && ids.has(o.parent) && !objectives[o.parent].parent;
  const out = [];
  for (const [id, o] of list) {
    if (isChild(o)) continue;
    out.push({ id, ...o, depth: 0 });
    for (const [cid, c] of list) if (c.parent === id && isChild(c)) out.push({ id: cid, ...c, depth: 1 });
  }
  const next = out.find(o => !o.done && !o.optional);
  if (next) next.isNext = true;
  return out;
}

/** Progress over the steps this viewer can see; optional steps don't count. */
export function progress(objectives = {}, { showHidden = false } = {}) {
  const list = Object.values(objectives).filter(o => (showHidden || !o.hidden) && !o.optional);
  const done = list.filter(o => o.done).length;
  const total = list.length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** Parent for "indent": the nearest top-level step above, if this step has no sub-steps of its own. */
export function indentTarget(ordered, id) {
  const i = ordered.findIndex(o => o.id === id);
  if (i < 1 || ordered[i].depth !== 0) return null;
  if (ordered[i + 1]?.depth === 1) return null;
  for (let j = i - 1; j >= 0; j--) if (ordered[j].depth === 0) return ordered[j].id;
  return null;
}

/** Changed by someone else since this user last looked. */
export function isUnread(stats, userId, readAt) {
  return !!stats?.modifiedTime && stats.lastModifiedBy !== userId && stats.modifiedTime > (readAt ?? 0);
}
