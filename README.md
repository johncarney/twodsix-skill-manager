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

## License

MIT
