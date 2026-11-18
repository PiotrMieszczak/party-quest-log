// The quest detail (header, tabs, panels) shared by the Quest Log window and the journal page sheet.
import {
  MODULE_ID, STATUSES, CATEGORIES, REWARD_KINDS,
  canDo, sortedEntries, nextSort, orderObjectives, progress, indentTarget, isUnread
} from "./logic.mjs";

export const DETAIL_TEMPLATE = `modules/${MODULE_ID}/templates/detail.hbs`;

const L = key => game.i18n.localize(key);
const TextEditor = () => foundry.applications.ux.TextEditor.implementation;

/* ── Per-user state kept in user flags (no quest writes, works for observers) ── */

const readCache = {};
export function readAt(page) {
  return readCache[page.id] ?? game.user.getFlag(MODULE_ID, "read")?.[page.id] ?? 0;
}
export function unread(page) {
  return isUnread(page._stats, game.user.id, readAt(page));
}
/** Marks the quest read; returns the previous read time so "New" markers survive this view. */
export function markRead(page) {
  const prev = readAt(page);
  if (!unread(page)) return prev;
  readCache[page.id] = Date.now();
  game.user.update({ [`flags.${MODULE_ID}.read.${page.id}`]: readCache[page.id] });
  return prev;
}
export function isTracked(page) {
  return !!game.user.getFlag(MODULE_ID, "tracked")?.[page.id];
}
function toggleTracked(page) {
  const key = `flags.${MODULE_ID}.tracked.${isTracked(page) ? "-=" : ""}${page.id}`;
  return game.user.update({ [key]: true });
}

/** The detail tab a user last looked at, per quest. */
const tabs = new Map();
export const getTab = page => tabs.get(page.id) ?? "todo";

export const gmPage = page => page.parent?.pages.find(p => p.getFlag(MODULE_ID, "gm"));

/* ── Context ─────────────────────────────────────────────────────────── */

export async function prepareDetail(page, { prevRead = readAt(page), inLog = false } = {}) {
  const user = game.user;
  const s = page.system;
  const who = { isGM: user.isGM, isOwner: page.isOwner, userId: user.id };
  const showHidden = user.isGM;
  const tab = getTab(page);
  const userName = id => game.users.get(id)?.name ?? L("PQL.Someone");

  const objectives = orderObjectives(s.objectives, { showHidden }).map(o => ({
    ...o,
    canEdit: canDo(who, "editObjective", o),
    author: o.createdBy && !game.users.get(o.createdBy)?.isGM ? userName(o.createdBy) : null
  }));
  for (const o of objectives) o.canIndent = o.canEdit && (o.depth === 1 || !!indentTarget(objectives, o.id));
  const prog = progress(s.objectives, { showHidden });

  const log = sortedEntries(s.log).reverse().map(([id, e]) => ({ id, ...e, isNew: e.created > prevRead }));
  const notes = sortedEntries(s.notes).map(([id, n]) => {
    const author = game.users.get(n.author);
    return {
      id, text: n.text,
      name: author?.name ?? L("PQL.Someone"),
      initial: (author?.name ?? "?").charAt(0).toUpperCase(),
      color: author?.color?.css ?? "#888",
      date: n.created ? new Date(n.created).toLocaleDateString() : "",
      canEdit: canDo(who, "editNote", n)
    };
  });
  const rewards = sortedEntries(s.rewards).map(([id, r]) => {
    const visible = r.revealed || user.isGM;
    return {
      id, ...r, visible,
      icon: REWARD_KINDS[r.kind]?.icon ?? "fa-gem",
      kindLabel: r.detail || L(REWARD_KINDS[r.kind]?.label ?? ""),
      isItem: r.kind === "item" && !!r.uuid,
      canClaim: r.kind === "item" && !!r.uuid && canDo(who, "claim", r)
    };
  });

  const gm = user.isGM ? gmPage(page) : null;
  const count = n => (n ? String(n) : "");
  const status = STATUSES[s.status] ?? STATUSES.hook;

  return {
    uuid: page.uuid,
    inLog,
    questTitle: page.name,
    status: s.status,
    statusLabel: L(status.label),
    statusIcon: status.icon,
    statusChoices: Object.entries(STATUSES).map(([k, v]) => ({ value: k, label: L(v.label), selected: k === s.status })),
    category: L(CATEGORIES[s.category] ?? ""),
    giver: s.giver,
    location: s.location,
    tracked: isTracked(page),
    progress: prog,
    summary: s.summary ? await TextEditor().enrichHTML(s.summary, { relativeTo: page, secrets: user.isGM }) : "",
    sections: [
      { id: "info", label: L("PQL.TabInfo"), icon: "fa-circle-info", count: "" },
      { id: "todo", label: L("PQL.TabTodo"), icon: "fa-list-check", count: prog.total ? `${prog.done}/${prog.total}` : "" },
      { id: "notes", label: L("PQL.TabNotes"), icon: "fa-feather", count: count(notes.length) },
      { id: "rewards", label: L("PQL.TabRewards"), icon: "fa-gem", count: count(rewards.length) }
    ].map(t => ({ ...t, active: t.id === tab })),
    tab: { info: tab === "info", todo: tab === "todo", notes: tab === "notes", rewards: tab === "rewards", gm: tab === "gm" && user.isGM },
    log, objectives, notes, rewards,
    gmText: gm ? await TextEditor().enrichHTML(gm.text?.content ?? "", { relativeTo: gm, secrets: true }) : "",
    hasGmPage: !!gm,
    rewardKinds: Object.entries(REWARD_KINDS).filter(([k]) => k !== "item").map(([k, v]) => ({ value: k, label: L(v.label) })),
    can: {
      gm: user.isGM,
      tick: canDo(who, "tick"),
      add: canDo(who, "add"),
      note: canDo(who, "note"),
      accept: canDo(who, "accept", s)
    }
  };
}

/* ── Actions ─────────────────────────────────────────────────────────── */

const path = (list, id, key) => `system.${list}.${id}${key ? `.${key}` : ""}`;
const del = (list, id) => `system.${list}.-=${id}`;
const rowId = el => el.closest("[data-id]")?.dataset.id;

const CLICK = {
  tab: (page, el, host) => { tabs.set(page.id, el.dataset.tab); host.refresh(); },
  track: async (page, el, host) => { await toggleTracked(page); host.refresh(); },
  accept: page => page.update({ "system.status": "active" }),
  edit: page => page.sheet.render({ force: true, mode: "edit" }),
  journal: page => page.parent.sheet.render({ force: true, pageId: page.id }),

  "obj-add": (page, el) => addFromInput(el, "objective", text => {
    const id = foundry.utils.randomID();
    return page.update({ [path("objectives", id)]: { text, sort: nextSort(page.system.objectives), createdBy: game.user.id } });
  }),
  "obj-delete": (page, el) => page.update({ [del("objectives", rowId(el))]: null }),
  "obj-indent": (page, el) => {
    const id = rowId(el);
    const o = page.system.objectives[id];
    const parent = o.parent ? null : indentTarget(orderObjectives(page.system.objectives, { showHidden: game.user.isGM }), id);
    return page.update({ [path("objectives", id, "parent")]: parent });
  },
  "obj-optional": (page, el) => flip(page, "objectives", rowId(el), "optional"),
  "obj-hidden": (page, el) => flip(page, "objectives", rowId(el), "hidden"),

  "note-add": (page, el) => addFromInput(el, "note", text => page.update({
    [path("notes", foundry.utils.randomID())]: { text, author: game.user.id, created: Date.now(), sort: nextSort(page.system.notes) }
  })),
  "note-delete": (page, el) => page.update({ [del("notes", rowId(el))]: null }),

  "log-add": (page, el) => {
    const form = el.closest("[data-form]");
    const label = form.querySelector("[name=label]").value.trim();
    return addFromInput(el, "log", text => page.update({
      [path("log", foundry.utils.randomID())]: { label, text, created: Date.now() }
    }));
  },
  "log-delete": (page, el) => page.update({ [del("log", rowId(el))]: null }),

  "reward-add": (page, el) => {
    const form = el.closest("[data-form]");
    const kind = form.querySelector("[name=kind]").value;
    return addFromInput(el, "reward", name => page.update({
      [path("rewards", foundry.utils.randomID())]: { kind, name, sort: nextSort(page.system.rewards) }
    }));
  },
  "reward-reveal": (page, el) => flip(page, "rewards", rowId(el), "revealed"),
  "reward-delete": (page, el) => page.update({ [del("rewards", rowId(el))]: null }),
  "reward-claim": (page, el) => claim(page, rowId(el)),

  "gm-page": async page => {
    let gm = gmPage(page);
    if (!gm) {
      [gm] = await page.parent.createEmbeddedDocuments("JournalEntryPage", [{
        name: L("PQL.GmPageName"), type: "text", text: { content: "" },
        ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
        flags: { [MODULE_ID]: { gm: true } }
      }]);
    }
    gm.sheet.render({ force: true, mode: "edit" });
  }
};

const CHANGE = {
  done: (page, el) => page.update({ [path("objectives", rowId(el), "done")]: el.checked }),
  "obj-text": (page, el) => {
    const text = el.value.trim();
    return text ? page.update({ [path("objectives", rowId(el), "text")]: text }) : null;
  },
  status: (page, el) => page.update({ "system.status": el.value })
};

function flip(page, list, id, key) {
  return page.update({ [path(list, id, key)]: !page.system[list][id][key] });
}

function addFromInput(el, name, save) {
  const input = el.closest("[data-form]")?.querySelector(`[data-input="${name}"]`);
  const value = input?.value.trim();
  if (!value) return input?.focus();
  input.value = "";
  return save(value);
}

async function claim(page, id) {
  const reward = page.system.rewards[id];
  const actor = game.user.character;
  if (!actor) return ui.notifications.warn(L("PQL.NoCharacter"));
  const item = reward?.uuid ? await fromUuid(reward.uuid) : null;
  if (!item) return ui.notifications.warn(L("PQL.ItemMissing"));
  // Mark first so a double click can't hand out two copies.
  await page.update({ [path("rewards", id, "claimedBy")]: actor.name });
  await actor.createEmbeddedDocuments("Item", [item.toObject()]);
  ui.notifications.info(game.i18n.format("PQL.Claimed", { item: item.name, actor: actor.name }));
}

async function dropItem(page, event) {
  const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
  if (data?.type !== "Item") return;
  const item = await fromUuid(data.uuid);
  if (!item) return;
  const typeLabel = CONFIG.Item.typeLabels?.[item.type];
  await page.update({
    [path("rewards", foundry.utils.randomID())]: {
      kind: "item", uuid: item.uuid, name: item.name, img: item.img,
      detail: typeLabel ? L(typeLabel) : "", sort: nextSort(page.system.rewards)
    }
  });
}

/**
 * Wires the detail's controls. `root` is re-created on every render, so listeners never stack.
 * @param {HTMLElement} root
 * @param {JournalEntryPage} page
 * @param {{refresh: Function}} host re-renders the view after local (non-document) state changes
 */
export function bindDetail(root, page, host) {
  const run = async (fn, el) => {
    try { await fn(page, el, host); }
    catch (err) { console.error(`${MODULE_ID} |`, err); ui.notifications.error(L("PQL.ActionFailed")); }
  };
  root.addEventListener("click", event => {
    const el = event.target.closest("[data-pql]");
    if (!el || el.tagName === "INPUT" || el.tagName === "SELECT") return;
    const fn = CLICK[el.dataset.pql];
    if (!fn) return;
    event.preventDefault();
    run(fn, el);
  });
  root.addEventListener("change", event => {
    const el = event.target.closest("[data-pql]");
    const fn = el && CHANGE[el.dataset.pql];
    if (!fn) return;
    event.stopPropagation(); // keep the edit-mode form from also submitting
    run(fn, el);
  });
  root.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    const input = event.target.closest("[data-input]");
    if (!input) return;
    // In a multi-line note, plain Enter is a new line; Ctrl/Cmd+Enter sends.
    if (input.tagName === "TEXTAREA" && !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault(); // Enter would otherwise submit a surrounding form
    const button = input.closest("[data-form]")?.querySelector("[data-submit]");
    if (button) run(CLICK[button.dataset.pql], button);
  });
  root.addEventListener("dragstart", event => {
    const uuid = event.target.closest("[data-drag-uuid]")?.dataset.dragUuid;
    if (uuid) event.dataTransfer.setData("text/plain", JSON.stringify({ type: "Item", uuid }));
  });
  if (game.user.isGM) {
    const zone = root.querySelector("[data-drop=rewards]");
    zone?.addEventListener("dragover", event => event.preventDefault());
    zone?.addEventListener("drop", event => { event.preventDefault(); run(p => dropItem(p, event)); });
  }
}
