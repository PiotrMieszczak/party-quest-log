# Party Quest Log (`party-quest-log`)

A Foundry VTT quest log that the players run themselves, for any game system. Quests are
ordinary journal pages, so Foundry's own permissions, links and compendiums all work.
No build step, no dependencies. The look follows [Synced Music](https://github.com/PiotrMieszczak/foundry-music).

> **Status: early.** Built against the Foundry v13 API docs and checked outside Foundry
> (unit tests and rendered templates). It has not been run in a live world yet.

## How it works

- **Quest Log window.** Open it with the **Quest Log** button at the top of the Journal
  sidebar, or press **Q**. Tabs along the top: **Active**, **Done**, **Failed**, **Hooks**.
  Quests are grouped into Main, Side and Personal, with search and a category filter. A dot
  marks quests changed since you last looked; a pin marks the ones you track.
- **New quest (GM).** The **+** button asks for a name and creates a journal entry in a
  **Quests** folder. The entry holds the quest page, which every player can edit, and a
  **GM Secrets** page that only the GM sees.
- **Each quest has tabs:**
  - **Info:** the GM's quest info, then **What we know**, a dated story log the GM adds to.
    Entries added since your last visit are marked *New*.
  - **To-do:** players tick steps and add their own to-dos (they can edit or delete only
    their own). Steps can be sub-steps. The GM can mark a step optional or hide it from
    players. The current step is highlighted.
  - **Notes:** a party notes feed with author and date. Ctrl+Enter adds a note.
  - **Rewards:** the GM drops items in or adds gold, XP or a favour, and reveals each one
    when ready (players see **???** until then). Players drag an item onto their sheet or
    press **Claim** to add it to their assigned character.
  - **Secrets (GM only):** the GM Secrets page.
- **Status.** The GM sets it from the header. Players can **Take on this quest** to move a
  Hook to Active.
- **Journal page.** A quest opened in a journal shows the same view. In edit mode the GM
  sets status, category, quest giver, location and quest info.

## Permissions

Quest pages are created with **Owner** for all players, so they can tick, add and write
notes even when the GM is away. The limits on what players may change (title, info,
rewards, status) are enforced in the interface only: it is meant for a trusted table.
Real secrets belong on the GM Secrets page, which players cannot read. See
[DESIGN.md](DESIGN.md) for the reasoning.

## Install

Clone or copy this folder into your Foundry `Data/modules/` folder as `party-quest-log`,
then enable **Party Quest Log** in your world.

## Development

```bash
node --test
```

The tests cover the permission rules, objective ordering, progress, and that every
interface string exists in English and Polish. `mock/quest-log-mock.html` is the
clickable design mock.
