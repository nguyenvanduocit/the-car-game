# BlockGame

A first-person multiplayer puzzle game built with BabylonJS and Colyseus.

## Project Structure

This is a Bun workspace monorepo with three packages:

```
blockgame/
├── packages/
│   ├── shared/          # Shared TypeScript types and interfaces
│   ├── server/          # Backend server (Bun + Colyseus)
│   └── ui/              # Frontend client (Vite + BabylonJS)
├── specs/               # Feature specifications and planning documents
└── package.json         # Root workspace configuration
```

## Tech Stack

### Backend (`packages/server`)
- **Bun** - Runtime and package manager
- **Colyseus** 0.16+ - Multiplayer game server framework
- **@babylonjs/havok** - Server-side physics engine
- **TypeScript** 5.3+

### Frontend (`packages/ui`)
- **BabylonJS** 8.37+ - 3D rendering engine
- **@babylonjs/gui** - UI overlay system
- **@babylonjs/havok** - Client-side physics
- **Colyseus Client** - Server connection
- **Vite** (rolldown-vite 7.2.2) - Build tool
- **TypeScript** 5.3+

### Shared (`packages/shared`)
- TypeScript type definitions shared between client and server

## Development Setup

### Prerequisites
- Bun 1.0+ ([Install Bun](https://bun.sh))
- Git

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd blockgame

# Install dependencies for all packages
bun install
```

### Development

Run both server and client in development mode:

```bash
# Terminal 1: Start the backend server
bun run dev:server

# Terminal 2: Start the frontend client
bun run dev:ui
```

Or run both simultaneously:

```bash
bun run dev
```

The server will start at `http://localhost:7001` and the client at `http://localhost:7000`.

### Individual Package Commands

```bash
# Server development
cd packages/server
bun run dev          # Start with hot reload
bun run test         # Run tests

# UI development
cd packages/ui
bun run dev          # Start Vite dev server
bun run build        # Build for production
bun run preview      # Preview production build
```

## Project Status

**Current Phase**: Phase 1 (Setup) - COMPLETED

Tasks completed:
- [X] Monorepo structure with Bun workspaces
- [X] TypeScript configuration for all packages
- [X] Dependency installation (Colyseus, BabylonJS, Havok)
- [X] Vite configuration
- [X] HTML entry point with canvas
- [X] .gitignore files

**Next Phase**: Phase 2 (Foundational) - Define shared types and Colyseus schemas

See `/Volumes/Data/firegroup/rnd/blockgame/specs/001-babylonjs-colyseus-sample/tasks.md` for full task list.

## Documentation

- [Implementation Plan](./specs/001-babylonjs-colyseus-sample/plan.md)
- [Data Model](./specs/001-babylonjs-colyseus-sample/data-model.md)
- [Tasks](./specs/001-babylonjs-colyseus-sample/tasks.md)
- [Feature Specification](./specs/001-babylonjs-colyseus-sample/spec.md)

## License

Private - Internal use only
