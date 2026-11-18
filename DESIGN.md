# Party Quest Log — Foundry VTT module

Working id: `party-quest-log`. Target: Foundry **v13+** (ApplicationV2). System-agnostic.

---

## 1. Research summary

### Existing Foundry modules
| Module | What it gets right | What hurts |
|---|---|---|
| **Forien's Quest Log** (v0.9 for v13) | Rich: objectives, rewards, quest giver, status tabs, show-to-players | Own storage layer, huge codebase, maintenance has stalled and moved between forks; players mostly read-only |
| **Monk's Enhanced Journal** (quest page) | Quest is a journal page → native permissions, linking | Part of a giant module; quest UI is GM-centric |
| Simple/Simpler Quests, Qjrnl, Quest System, RPGX | Lightweight, status states (active/complete/failed) | Thin: no player-editable to-dos or notes |

**Gap to fill:** a quest log the **players actually operate**: they tick objectives, add their own to-dos, write notes, and claim rewards. The GM keeps control of the story parts.

### Video game quest journals (Witcher 3, BG3, Skyrim, WoW)
Patterns worth copying:
1. **List + detail split.** Quests on the left, grouped by status or category. Detail on the right.
2. **Status buckets.** Active / Completed / Failed. The finished ones collapse out of the way.
3. **Objectives as a checklist** with the current step on top and done steps struck through. Optional steps are marked.
4. **Track/pin** a quest, which puts its next objectives on a small on-screen HUD (Witcher 3).
5. **The journal grows as you play** (BG3, Witcher). The description gets new entries; old ones stay as history.
6. **Rewards are visible up front** when known, or shown as "???" until revealed.
7. **Unread markers** on quests that changed since you last looked.

---

**Visual design:** follows Synced Music's design system (`foundry-music/DESIGN.md`): neutrals mixed from currentColor, Foundry orange only for what is "in play", the 2px progress line, flat 4px panels, Signika only. Approved mock: `mock/quest-log-mock.html`.

## 2. Core design decisions

### D1. A quest is a custom **JournalEntryPage sub-type** `party-quest-log.quest`
- We get Foundry's native per-user **ownership**, `@UUID` linking, compendium packing, search and import/export for free. There's no custom storage layer.
- Declared in `module.json → documentTypes.JournalEntryPage.quest`, with a `TypeDataModel` and an ApplicationV2 page sheet.
- Quests live in one world JournalEntry folder called "Quests", but the log finds quest pages in any journal.

### D2. Players operate quests through ownership
- Default ownership for a quest page is **Owner** for players, so they can update it directly. No GM relay is needed, and it works while the GM is away.
- **GM secrets don't go on the quest page.** Owners can read all of a document's data, so a `hidden` flag only hides things in the UI. Real secrets go on a sibling **GM-only text page** in the same JournalEntry. The sheet shows it in a "GM" tab for GMs only.
- Players with only Observer ownership see a read-only sheet.
- Field-level rules (players can't edit the title, description or rewards) are enforced **in the UI only**. That's fine for a trusted table and is documented as such.

### D3. Lists are keyed objects, not arrays
Foundry replaces a whole array on update, so two players ticking boxes at the same moment would overwrite each other. Objectives, notes, rewards and journal entries are stored as `{ [id]: entry }` (`TypedObjectField`). Each update touches only `system.objectives.<id>.done`, so changes merge safely.

---

## 3. Data model (`system` of a quest page)

```js
{
  status:   "hook" | "active" | "done" | "failed",          // Quest Log tabs: Active / Done / Failed / Hooks
  category: "main" | "side" | "personal",
  priority: 0..3,
  giver:    "",                                            // free text
  location: "",
  summary:  "<html>",          // QUEST INFO: one-paragraph hook (GM-editable)
  log: {                       // INFORMATION ("What we know"): the growing story log (GM adds entries)
    [id]: { label: "Day 14", text: "", created: 1730000000 }
  },
  objectives: {                // TO-DO LIST
    [id]: {
      text: "", done: false, failed: false,
      optional: false, hidden: false,       // hidden = GM hasn't revealed it yet (UI only)
      parent: null | id,                    // one level of sub-steps
      createdBy: userId, sort: 0
    }
  },
  notes: {                     // NOTES: anyone with ownership can add; authors edit their own
    [id]: { text: "<html>", author: userId, date: 0 }
  },
  rewards: {                   // REWARD
    [id]: {
      type: "item" | "xp" | "currency" | "text",
      uuid: null,             // for type item: compendium or world Item uuid
      label: "", qty: 1,
      revealed: false,        // players see "???" until true
      claimedBy: null | actorUuid
    }
  },
}
// Per-user state lives in user flags, not on the quest (no quest writes, works for observers):
// flags.party-quest-log.tracked.<pageId> = true, flags.party-quest-log.read.<pageId> = timestamp
```

Progress is computed, never stored: `done / (visible, non-optional objectives)`.

---

## 4. UI

### 4.1 Quest Log window (ApplicationV2), opened from a button in the Journal sidebar header plus a keybinding (default `Q`)
```
┌ Quest Log ───────────────────────────────────────────────────────┐
│ [Search…]  [Category ▾]                                [+ Quest]* │
├───────────────────────┬──────────────────────────────────────────┤
│ ▼ ACTIVE (3)          │  ⟨banner img⟩                             │
│  ★ The Drowned Bell ● │  THE DROWNED BELL        [Active ▾]* [📌] │
│    Smuggler's Debt    │  Main · Given by Mayor Holt · Saltmere    │
│    Missing Courier    │  ▓▓▓▓▓▓░░░░ 3/5                           │
│ ▶ AVAILABLE (1)       │ ┌Info┬To-do┬Notes┬Rewards┬GM*┐            │
│ ▶ COMPLETED (7)       │ │ ☑ Speak with the mayor                  │
│ ▶ FAILED (1)          │ │ ☑ Find the bell-ringer's diary          │
│                       │ │ ☐ Reach the sunken chapel               │
│                       │ │    ☐ Find a boat (sub-step)             │
│                       │ │ ☐ (optional) Recover the relic          │
│                       │ │ [+ add to-do]                            │
└───────────────────────┴──────────────────────────────────────────┘
 * GM only    ● unread    ★ tracked
```
The left list reacts live to `updateJournalEntryPage` hooks.

### 4.2 Detail tabs (the same template is used inside the log and as the page sheet)
| Tab | Content | GM | Player (Owner) |
|---|---|---|---|
| **Info** (quest info + information) | summary, giver, location, category, then journal entries newest-first | edit everything, add entries | read |
| **To-do** | objective checklist, sub-steps, drag to reorder | everything, plus reveal/hide | tick/untick, add own to-dos, edit/delete own |
| **Notes** | party notes stream with author and date | everything | add; edit/delete own |
| **Rewards** | item cards (drag to an actor sheet), XP, currency, text | add (drop an Item), reveal | see revealed rewards; claim (marks `claimedBy`; dragging copies the item) |
| **GM** | the sibling GM-only text page | edit | hidden |

### 4.3 Tracker HUD
A small ApplicationV2 that docks top-right and lists each tracked quest with its next 1–3 open objectives. You can tick them right there. Each user turns it on for themselves (client setting).

### 4.4 Notifications (world setting, on by default)
A chat card and toast appear when a quest becomes Active, Completed or Failed, when an objective is completed, or when a reward is revealed. The GM triggers these through a `preUpdate`/`update` diff, and only the user who made the change posts, to avoid duplicates.

---

## 5. Permissions matrix (summary)
- **Create/delete quest:** GM (setting: "Players may create personal quests", which makes a quest in the Personal category owned by the creating player).
- **Change status:** GM. Players with Owner can take on a Hook (Hook → Active).
- **Objectives:** tick = Owner; add = Owner; edit/delete = GM or `createdBy`.
- **Notes:** add = Owner; edit/delete = GM or author.
- **Rewards:** manage = GM; claim = Owner.

All checks live in one `canDo(user, action, quest, entry?)` helper that the templates and handlers use, so there's one rule source.

---

## 6. Out of scope for v1 (named so they're not forgotten)
Quest chains/prerequisites, map pins, auto-distributing currency or XP to actors (system-specific), per-player private notes, real server-side enforcement of field permissions, localisation beyond `en` + `pl`.

---

## 7. Implementation plan

**File layout**
```
party-quest-log/
  module.json            documentTypes, esmodules, styles, languages
  scripts/
    main.mjs             init/ready hooks, registration, settings, keybinding
    quest-model.mjs      TypeDataModel (schema + derived progress)
    logic.mjs            canDo(), progress  ← pure, unit-tested
    quest-sheet.mjs      JournalEntryPageHandlebarsSheet subclass (tabs, actions)
    quest-log.mjs        ApplicationV2 + HandlebarsApplicationMixin (list + detail)
    tracker.mjs          HUD app
    notify.mjs           chat/toast on diffs
  templates/  quest-detail.hbs, tabs/*.hbs, log.hbs, tracker.hbs
  styles/quest-log.css
  lang/en.json, pl.json
  test/logic.test.mjs  (node --test)
```

**Phases** (each one is playable on its own)
1. **Skeleton.** Manifest, empty `quest` sub-type, model with `status/summary/objectives`, a minimal sheet that renders and saves. *Done when* you can create a quest page in a journal and tick an objective as a player.
2. **Full data model + sheet tabs.** Info, To-do (sub-steps, reorder, hidden), Notes, Rewards (Item drop, drag-out, claim), GM tab via sibling page. `canDo()` plus its unit tests. *Done when* the permissions matrix holds when tested as a GM and as a player.
3. **Quest Log window.** Grouped list, search, category filter, unread dots, "+ Quest" (creates a JournalEntry with the quest page and a GM page in the Quests folder, with player Owner by default), and live refresh. Sidebar button and keybinding.
4. **Tracker HUD + notifications.**
5. **Polish.** `pl` localisation, CSS theme (light/dark follow Foundry), README, release zip with GitHub Actions and a manifest URL.

**Testing:** run `canDo()` and the progress calculation under `node --test`. Everything else is a manual checklist in two browsers (GM + player): concurrent ticks don't overwrite each other, Observer is read-only, hidden objectives don't appear, and claimed rewards can't be double-claimed.

**Risks**
- The sheet API for page sub-types changed between v12 and v13. Build against v13 only.
- Players with Owner can technically edit any field through the console. This is accepted and documented (D2).
- Rewards need an actor for each player. The claim button uses the user's assigned character.
