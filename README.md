# Skill Manager

A Foundry VTT module for managing skills.

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
ln -s /path/to/skill-manager/dist /path/to/foundry-data/Data/modules/skill-manager
```

## License

MIT
