import { MODULE_ID, QUEST_TYPE } from "./logic.mjs";
import { QuestModel } from "./quest-model.mjs";
import { QuestSheet } from "./quest-sheet.mjs";
import { QuestLog, createQuest } from "./quest-log.mjs";
import { DETAIL_TEMPLATE } from "./quest-view.mjs";

let log;
const getLog = () => (log ??= new QuestLog());
/** Opens the Quest Log, optionally on a given quest page. */
const open = page => getLog().show(page);

Hooks.once("init", () => {
  CONFIG.JournalEntryPage.dataModels[QUEST_TYPE] = QuestModel;
  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.JournalEntryPage, MODULE_ID, QuestSheet,
    { types: [QUEST_TYPE], makeDefault: true, label: "PQL.SheetLabel" }
  );
  foundry.applications.handlebars.loadTemplates([DETAIL_TEMPLATE]);

  game.keybindings.register(MODULE_ID, "open", {
    name: "PQL.KeyOpen",
    editable: [{ key: "KeyQ" }],
    onDown: () => {
      const app = getLog();
      app.rendered ? app.close() : open();
      return true;
    }
  });

  game.modules.get(MODULE_ID).api = { open, createQuest };
});

// Players operate quests, so quest pages default to Owner for everyone (DESIGN D2).
Hooks.on("preCreateJournalEntryPage", (page, data) => {
  if (page.type !== QUEST_TYPE || data.ownership) return;
  page.updateSource({ "ownership.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER });
});

// Keep the open log in step with everyone's changes.
const refresh = () => log?.refresh();
for (const hook of ["create", "update", "delete"]) {
  Hooks.on(`${hook}JournalEntryPage`, page => { if (page.type === QUEST_TYPE || page.getFlag(MODULE_ID, "gm")) refresh(); });
  Hooks.on(`${hook}JournalEntry`, refresh); // ownership changes show or hide quests
}

// A "Quest Log" button at the top of the Journal sidebar.
Hooks.on("renderJournalDirectory", (app, html) => {
  const el = html instanceof HTMLElement ? html : html[0];
  if (!el || el.querySelector(".pql-open")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pql-open";
  button.innerHTML = `<i class="fa-solid fa-book-bookmark" inert></i> ${game.i18n.localize("PQL.LogTitle")}`;
  button.addEventListener("click", () => open());
  (el.querySelector(".header-actions") ?? el.querySelector("header") ?? el).append(button);
});
