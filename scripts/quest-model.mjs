import { STATUSES, CATEGORIES, REWARD_KINDS } from "./logic.mjs";

const f = foundry.data.fields;
const choices = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v.label ?? v]));

// Every list is keyed by id, not an array, so concurrent player edits merge (DESIGN D3).
export class QuestModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      status: new f.StringField({ required: true, initial: "hook", label: "PQL.StatusLabel", choices: choices(STATUSES) }),
      category: new f.StringField({ required: true, initial: "main", label: "PQL.CategoryLabel", choices: CATEGORIES }),
      giver: new f.StringField({ required: true, blank: true, initial: "", label: "PQL.Giver" }),
      location: new f.StringField({ required: true, blank: true, initial: "", label: "PQL.Location" }),
      summary: new f.HTMLField({ label: "PQL.Summary" }),
      // "What we know": the story so far, added to by the GM.
      log: new f.TypedObjectField(new f.SchemaField({
        label: new f.StringField({ required: true, blank: true, initial: "" }), // in-game date, e.g. "Day 14"
        text: new f.StringField({ required: true, blank: true, initial: "" }),
        created: new f.NumberField({ required: true, integer: true, initial: 0 })
      })),
      objectives: new f.TypedObjectField(new f.SchemaField({
        text: new f.StringField({ required: true, blank: true, initial: "" }),
        done: new f.BooleanField({ initial: false }),
        optional: new f.BooleanField({ initial: false }),
        hidden: new f.BooleanField({ initial: false }), // UI-only secrecy, see DESIGN D2
        parent: new f.StringField({ nullable: true, initial: null }),
        createdBy: new f.StringField({ nullable: true, initial: null }),
        sort: new f.NumberField({ required: true, integer: true, initial: 0 })
      })),
      notes: new f.TypedObjectField(new f.SchemaField({
        text: new f.StringField({ required: true, blank: true, initial: "" }),
        author: new f.StringField({ nullable: true, initial: null }),
        created: new f.NumberField({ required: true, integer: true, initial: 0 })
      })),
      rewards: new f.TypedObjectField(new f.SchemaField({
        kind: new f.StringField({ required: true, initial: "item", choices: choices(REWARD_KINDS) }),
        uuid: new f.StringField({ nullable: true, initial: null }),
        name: new f.StringField({ required: true, blank: true, initial: "" }),
        detail: new f.StringField({ required: true, blank: true, initial: "" }),
        img: new f.StringField({ nullable: true, initial: null }),
        revealed: new f.BooleanField({ initial: false }),
        claimedBy: new f.StringField({ nullable: true, initial: null }),
        sort: new f.NumberField({ required: true, integer: true, initial: 0 })
      }))
    };
  }
}
