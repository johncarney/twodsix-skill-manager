# Twodsix Skill Manager

A Foundry VTT module for managing skills in the Twodsix game system.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/) >= 10

## Setup

```bash
pnpm install
```

## Development

| Command           | Description                                |
|-------------------|--------------------------------------------|
| `pnpm build`      | Production build to `dist/`                |
| `pnpm build:dev`  | Development build (unminified, sourcemaps) |
| `pnpm watch`      | Rebuild on file changes                    |
| `pnpm lint`       | Check for lint errors                      |
| `pnpm lint:fix`   | Auto-fix lint errors                       |
| `pnpm format`     | Check formatting                           |
| `pnpm format:fix` | Auto-fix formatting                        |
| `pnpm typecheck`  | Run TypeScript type checking               |
| `pnpm clean`      | Delete the `dist/` directory               |

## Installing in Foundry

After building, symlink or copy the `dist/` directory into your Foundry VTT
modules directory:

```bash
ln -s /path/to/skill-manager/dist /path/to/foundry-data/Data/modules/twodsix-skill-manager
```

## Implementation notes

Grouped skill value logic is handled in two places because the twodsix system
behaves differently depending on how a skill is added:

- **Search tool**: `addSkillToActor()` sets the correct group value before
  creation via `createEmbeddedDocuments`. The twodsix system does not override
  the value in this case.
- **Drag-and-drop**: The twodsix system unconditionally sets the value to -3
  (untrained) via an update after creation. A `preUpdateItem` hook intercepts
  that update and applies the grouped skill logic.

If the twodsix system were changed to respect the value set during
`preCreateItem`, the `preUpdateItem` hook would become a no-op rather than cause
a conflict, thanks to the `systemChanges.value >= 0` guard. The duplication in
`addSkillToActor()` could then also be removed.

Rolling skills from the search list requires the skill to be an embedded item on
the actor, because `doSkillTalentRoll()` is a method on Item and the roll dialog
populates its skill dropdown from the actor's owned items. For unowned skills,
`rollSkill()` temporarily adds the skill to the actor, performs the roll, then
removes it in a `finally` block. The skill will be briefly visible on the actor
sheet while the roll dialog is open.

This workaround could be eliminated if the twodsix system supported rolling
non-embedded skills. Specifically, `TwodsixRollSettings._throwDialog()` builds
its `skillsList` from `skill.actor.getSkillNameList()` (line 255 of
`TwodsixRollSettings.js`), which only returns embedded items. If it also included
the skill being rolled when that skill is not in the actor's collection — e.g.,
by merging `{ [skill.uuid]: skill.name }` into `skillsList` — then in-memory
Item instances could be used directly without the add/roll/remove cycle.

## License

MIT
