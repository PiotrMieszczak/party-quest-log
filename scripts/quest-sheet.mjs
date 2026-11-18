import { MODULE_ID } from "./logic.mjs";
import { prepareDetail, bindDetail, markRead } from "./quest-view.mjs";

const { JournalEntryPageHandlebarsSheet } = foundry.applications.sheets.journal;

/** The quest as a journal page: view mode is the same detail as the Quest Log, edit mode is the GM's form. */
export class QuestSheet extends JournalEntryPageHandlebarsSheet {
  static DEFAULT_OPTIONS = { classes: ["pql-quest"] };

  // Keep the core header/footer parts (title field etc.), swap in our content.
  static EDIT_PARTS = { ...super.EDIT_PARTS, content: { template: `modules/${MODULE_ID}/templates/sheet-edit.hbs` } };
  static VIEW_PARTS = { content: { template: `modules/${MODULE_ID}/templates/sheet-view.hbs` } };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const page = this.document;
    if (this.isView) {
      Object.assign(context, await prepareDetail(page, { prevRead: markRead(page) }));
    } else {
      context.systemFields = page.system.schema.fields;
      context.system = page.system;
      context.enrichedSummary = await foundry.applications.ux.TextEditor.implementation.enrichHTML(page.system.summary, {
        relativeTo: page, secrets: true
      });
    }
    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element.querySelector(".pql-detail-root");
    if (root) bindDetail(root, this.document, { refresh: () => this.render() });
  }
}
