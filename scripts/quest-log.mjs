import { MODULE_ID, QUEST_TYPE, STATUSES, CATEGORIES, progress } from "./logic.mjs";
import { prepareDetail, bindDetail, markRead, unread, isTracked } from "./quest-view.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const L = key => game.i18n.localize(key);

/** Every quest page this user can see, across all journals. */
export function visibleQuests() {
  return game.journal.contents
    .filter(entry => entry.visible)
    .flatMap(entry => entry.pages.contents)
    .filter(page => page.type === QUEST_TYPE && page.testUserPermission(game.user, "OBSERVER"));
}

export class QuestLog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pql-log",
    classes: ["pql-app"],
    window: { title: "PQL.LogTitle", icon: "fa-solid fa-book-bookmark", resizable: true },
    position: { width: 960, height: 660 }
  };

  static PARTS = {
    list: { template: `modules/${MODULE_ID}/templates/log-list.hbs` },
    detail: { template: `modules/${MODULE_ID}/templates/log-detail.hbs` }
  };

  #status = "active";
  #selected = null; // page uuid
  #search = "";
  #category = "";
  #prevRead = new Map(); // page id -> read time before this view, keeps "New" markers visible

  /** Opens the log on a quest, switching to its status tab. */
  show(page) {
    if (page) {
      this.#status = page.system.status;
      this.#selected = page.uuid;
    }
    return this.render({ force: true });
  }

  refresh = foundry.utils.debounce(() => { if (this.rendered) this.render(); }, 50);

  #quests() {
    const all = visibleQuests();
    const inTab = all.filter(p => p.system.status === this.#status);
    if (!inTab.some(p => p.uuid === this.#selected)) this.#selected = inTab[0]?.uuid ?? null;
    return { all, inTab };
  }

  async _prepareContext() {
    const { all, inTab } = this.#quests();
    return { all, inTab, selected: inTab.find(p => p.uuid === this.#selected) ?? null };
  }

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if (partId === "list") {
      const term = this.#search.toLowerCase();
      context.statuses = Object.entries(STATUSES).map(([key, s]) => ({
        key, label: L(s.tab), active: key === this.#status,
        count: context.all.filter(p => p.system.status === key).length
      }));
      context.search = this.#search;
      context.categories = Object.entries(CATEGORIES).map(([key, label]) => ({ key, label: L(label), selected: key === this.#category }));
      context.groups = Object.entries(CATEGORIES).map(([key, label]) => ({
        label: L(label),
        quests: context.inTab
          .filter(p => p.system.category === key)
          .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
          .map(p => ({
            uuid: p.uuid,
            name: p.name,
            sub: [p.system.giver, p.system.location].filter(Boolean).join(" · "),
            selected: p.uuid === this.#selected,
            unread: p.uuid !== this.#selected && unread(p),
            tracked: isTracked(p),
            failed: p.system.status === "failed",
            progress: p.system.status === "active" ? progress(p.system.objectives, { showHidden: game.user.isGM }) : null,
            hidden: (this.#category && this.#category !== key) || (term && !this.#matches(p, term))
          }))
      })).filter(g => g.quests.length);
      context.empty = !context.inTab.length;
      context.isGM = game.user.isGM;
    }
    if (partId === "detail" && context.selected) {
      const page = context.selected;
      if (!this.#prevRead.has(page.id)) this.#prevRead.set(page.id, markRead(page));
      // Merged into the part root so the shared partial's @root references resolve.
      Object.assign(context, await prepareDetail(page, { prevRead: this.#prevRead.get(page.id), inLog: true }), { hasDetail: true });
    }
    return context;
  }

  #matches(page, term) {
    const s = page.system;
    return [page.name, s.giver, s.location].some(v => v?.toLowerCase().includes(term));
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const list = this.element.querySelector(".pql-list");
    if (list && options.parts.includes("list")) this.#bindList(list);
    const root = this.element.querySelector(".pql-detail-root");
    if (root && options.parts.includes("detail")) bindDetail(root, context.selected, { refresh: () => this.render() });
  }

  #bindList(list) {
    list.addEventListener("click", event => {
      const tab = event.target.closest("[data-status]");
      if (tab) {
        this.#status = tab.dataset.status;
        this.#selected = null;
        return this.render();
      }
      const row = event.target.closest("[data-uuid]");
      if (row) {
        this.#selected = row.dataset.uuid;
        return this.render();
      }
      if (event.target.closest("[data-pql=new]")) this.#create();
    });
    list.addEventListener("keydown", event => {
      if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-uuid]")) {
        event.preventDefault();
        event.target.click();
      }
    });
    // Filter in place so the search box keeps focus while typing.
    const apply = () => {
      const term = this.#search.toLowerCase();
      for (const group of list.querySelectorAll(".pql-group")) {
        let any = false;
        for (const row of group.querySelectorAll("[data-uuid]")) {
          const page = fromUuidSync(row.dataset.uuid);
          const show = !!page && (!this.#category || page.system.category === this.#category) && (!term || this.#matches(page, term));
          row.hidden = !show;
          any ||= show;
        }
        group.hidden = !any;
      }
    };
    list.querySelector("[data-search]")?.addEventListener("input", event => { this.#search = event.target.value; apply(); });
    list.querySelector("[data-category]")?.addEventListener("change", event => { this.#category = event.target.value; apply(); });
  }

  async #create() {
    const name = await foundry.applications.api.DialogV2.prompt({
      window: { title: "PQL.NewQuest" },
      content: `<input type="text" name="name" placeholder="${L("PQL.QuestNamePlaceholder")}" aria-label="${L("PQL.QuestName")}" autofocus>`,
      ok: { label: "PQL.Create", callback: (event, button) => button.form.elements.name.value.trim() },
      rejectClose: false
    });
    if (!name) return;
    const page = await createQuest(name);
    if (page) this.show(page);
  }
}

/** A quest = a JournalEntry in the "Quests" folder with the quest page (players: Owner) and a GM-only secrets page. */
export async function createQuest(name) {
  const { OBSERVER, OWNER, NONE } = CONST.DOCUMENT_OWNERSHIP_LEVELS;
  const FolderCls = getDocumentClass("Folder");
  const EntryCls = getDocumentClass("JournalEntry");
  let folder = game.folders.find(f => f.type === "JournalEntry" && f.getFlag(MODULE_ID, "root"));
  folder ??= await FolderCls.create({ name: L("PQL.FolderName"), type: "JournalEntry", flags: { [MODULE_ID]: { root: true } } });
  const entry = await EntryCls.create({
    name,
    folder: folder.id,
    ownership: { default: OBSERVER },
    pages: [
      { name, type: QUEST_TYPE, ownership: { default: OWNER }, system: { status: "hook" } },
      { name: L("PQL.GmPageName"), type: "text", text: { content: "" }, ownership: { default: NONE }, flags: { [MODULE_ID]: { gm: true } } }
    ]
  });
  return entry?.pages.find(p => p.type === QUEST_TYPE) ?? null;
}
