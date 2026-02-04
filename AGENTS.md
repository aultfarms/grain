# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Tooling and workspace layout

- Package manager: Yarn 4 (Berry) with workspaces configured in the root `package.json` (`apps/*`, `libs/*`, `utils/*`). Yarn is vendored via `.yarn/releases/yarn-4.1.0.cjs` and configured in `.yarnrc.yml`.
- Language stack: TypeScript/JavaScript for all workspaces, React for most UIs, plus a legacy PHP tree under `php/`.
- High-level layout:
  - `apps/`: end-user web applications (React) for specific farm workflows (grain hauling, feed deliveries, cattle inventory, treatments, invoices, etc.).
  - `libs/`: TypeScript libraries containing core domain logic and integrations (accounts, Trello, Google Drive/Sheets, livestock, trucking, sheet utilities, Overmind helpers).
  - `utils/`: one-off or ad‑hoc Node scripts to analyze or migrate data (primarily against Trello and Google).
  - `php/`: legacy PHP implementation of many of the same workflows; not part of the Yarn workspaces.

Use `yarn workspaces list` at the repo root to see all registered workspaces.

## Common commands

All commands in this section are intended to be run from the repository root.

### Install dependencies

- Install all workspace dependencies:
  - `yarn install`

### Working with application frontends (`apps/*`)

There are two main styles of frontend apps: Vite-based React apps and Create React App (CRA) apps.

#### Vite-based apps (e.g. `feed`, `grain`, `weights`, `accounts`)

Examples below use `feed`; replace with another app name as needed.

- Start a dev server:
  - `yarn workspace feed dev`
- Build for production:
  - `yarn workspace feed build`
- Lint the app (where defined, e.g. `apps/feed`, `apps/grain`):
  - `yarn workspace feed lint`
- Build required shared libraries first (for apps that define `build:libs`, such as `feed`, `grain`, `weights`, `accounts`):
  - `yarn workspace feed build:libs`
  - then `yarn workspace feed build`
- Run a single app’s build or lint without affecting others:
  - Use the workspace directly, e.g. `yarn workspace grain build`, `yarn workspace grain lint`.

You can also `cd` into an app and run the same scripts (e.g. `cd apps/feed && yarn dev`), but using `yarn workspace` from the root keeps everything consistent.

#### CRA-based apps (e.g. `treatments`, `dead`, `inventory-cattle`)

Examples below use `treatments`; substitute the workspace name as needed.

- Start dev server:
  - `yarn workspace treatments start`
- Build for production:
  - `yarn workspace treatments build`
- Run tests (Jest via `react-scripts`):
  - `yarn workspace treatments test`
- Run tests for a single CRA app (without touching other workspaces):
  - `yarn workspace inventory-cattle test`

### Working with shared libraries (`libs/*`)

Most libraries in `libs/` are published-style TypeScript packages that build to `dist/` and often have both Node and browser bundles. The common pattern for core libs like `@aultfarms/accounts`, `@aultfarms/trello`, `@aultfarms/google`, `@aultfarms/livestock`, `@aultfarms/trucking`, and `@aultfarms/sheetutils` is:

- Build (TypeScript + Rollup):
  - `yarn workspace @aultfarms/accounts build`
  - `yarn workspace @aultfarms/trello build`
  - `yarn workspace @aultfarms/google build`
  - `yarn workspace @aultfarms/livestock build`
  - `yarn workspace @aultfarms/trucking build`
  - `yarn workspace @aultfarms/sheetutils build`
- Continuous build / dev mode (where defined):
  - `yarn workspace @aultfarms/accounts dev`
  - `yarn workspace @aultfarms/trello dev`
  - Similar `dev` scripts exist for other Rollup-based libs that watch TypeScript and rebuild bundles.

#### Library tests

Several libs have richer test setups that distinguish browser tests, Node tests, and TestCafe or live-server driven flows.

- `@aultfarms/accounts`:
  - Node tests (load example XLSX data, validate profit/loss and balance sheet exports):
    - `yarn workspace @aultfarms/accounts test:node`
  - Browser tests (served via `live-server` using `libs/accounts/test/index.html`):
    - `yarn workspace @aultfarms/accounts test:browser`
  - Combined tests:
    - `yarn workspace @aultfarms/accounts test`
- `@aultfarms/trello`:
  - Node-only tests:
    - `yarn workspace @aultfarms/trello test:node`
  - Browser tests (served via `live-server`):
    - `yarn workspace @aultfarms/trello test:browser`
  - Combined tests:
    - `yarn workspace @aultfarms/trello test`
- Rollup/TestCafe-based libs like `@aultfarms/google`, `@aultfarms/livestock`, `@aultfarms/trucking`, and `@aultfarms/sheetutils` use a common pattern:
  - Browser test run via `live-server` opening `dist/test/index.mjs` plus the main bundle:
    - `yarn workspace @aultfarms/google test`
    - `yarn workspace @aultfarms/livestock test`
    - `yarn workspace @aultfarms/trucking test`
    - `yarn workspace @aultfarms/sheetutils test`
  - TestCafe-driven suites (where present):
    - `yarn workspace @aultfarms/google test:testcafe`
    - `yarn workspace @aultfarms/trucking test:testcafe`
    - etc.

These test commands often spin up `live-server` or TestCafe and expect a browser to be available; they are best treated as interactive/integration tests rather than quick unit tests.

### One-off utilities (`utils/*`)

Utilities under `utils/` are standalone Node scripts (e.g. `grain-trello`, `dead-trello`, `move-treatment-cards-by-year`, `sheets/putIdOnBeefInventory`). They are not wired into a uniform CLI.

- The general pattern is to run them with Node from within the workspace:
  - `cd utils/grain-trello && node index.js`
  - `cd utils/dead-trello && node index.js`

Many of these scripts assume local, non-committed configuration (e.g., Trello tokens) and hard-coded paths; check the file contents before running or modifying them.

## High-level architecture

### Overall design

This repo implements Ault Farms’ internal tooling as a Yarn monorepo. The modern stack is TypeScript + React on the frontend, with shared TypeScript libraries modeling farm data and integrating with Trello and Google Workspace. An older PHP application under `php/` implements many of the same flows server-side.

At a high level:

- **Frontends (`apps/*`)** present focused UIs for specific workflows (grain hauling, feed deliveries, livestock weights, accounts dashboards, cattle treatments, invoices, etc.). Most are single-page React apps, built either with Vite or Create React App.
- **Domain and integration libraries (`libs/*`)** encapsulate all interactions with Trello boards, Google Drive/Sheets, and the higher-level farm accounting and livestock models.
- **Utilities (`utils/*`)** provide ad-hoc data inspection or migration against the same Trello and Google data sources used by the apps/libs.
- **Legacy PHP (`php/`)** contains previous iterations of these tools; the modern JS/TS apps and libs are the primary focus for new code.

### Core domain libraries

These libraries are central to the data model and are heavily reused across apps and scripts:

- `@aultfarms/trello` (`libs/trello/`)
  - Provides a universal Trello client with separate Node and browser entry points.
  - Node entry (`src/node/index.ts`) reads credentials from a local JSON5-ish config file at `/Users/aultac/.trello/token.js` with `devKey` and `token` fields, then exposes a higher-level `getClient()` wrapper.
  - The browser side integrates with Trello’s REST API and is bundled as `dist/browser/index.mjs`; tests are written to exercise both Node and browser clients via shared test modules.

- `@aultfarms/google` (`libs/google/`)
  - Wraps Google Drive and Sheets APIs for use both in Node and in the browser.
  - `src/drive.ts` and `src/sheets.ts` implement the low-level API calls and file operations.
  - The README notes that it pins specific `@maxim_mazurok/gapi.client.drive` and `gapi.client.sheets` versions to keep TypeScript’s type resolution stable; when updating dependencies here, keep those versions in sync.

- `@aultfarms/accounts` (`libs/accounts/`)
  - Implements the farm accounting model: loading accounts from spreadsheets, validating ledgers, computing profit/loss and balance sheets, and reconciling inventory vs cash.
  - Supports both Node and browser usage via a “universal” build: TypeScript is compiled twice (node-optimized sources to `dist/node`, browser sources to an intermediate browser tree, then rolled up into `dist/browser/index.mjs`).
  - The README explains how node/browser bundling is arranged and how to add browser-only shims via the `browser` field in `package.json`.
  - Tests are split between Node and browser:
    - Node tests (`src/test/node/index.ts`) load example XLSX files, run the universal account tests, and validate exported XLSX reports under `/tmp`.
    - Browser tests (`src/test/browser/*.test.ts`) are bundled and loaded via `test/index.html` using `live-server`.

- `@aultfarms/livestock` (`libs/livestock/`)
  - Models livestock-specific records and interacts with weights and inventory data, using Trello and Google through the other libs.
  - Currently focused on weights in Google Sheets; README notes intended refactors to make livestock a top-level concept that simply consumes the Trello client.

- `@aultfarms/trucking` (`libs/trucking/`)
  - Encapsulates grain and feed load data derived from Trello boards (e.g., parsing card names into structured loads with dates, bushels, crops, destinations, and tickets).
  - Powers grain/feed apps by normalizing Trello card data into domain objects used in the UI and reporting.

- `@aultfarms/sheetutils` (`libs/sheetutils/`)
  - Provides helpers for interpreting already-parsed spreadsheets (settings, comments, metadata, etc.), built with the same TypeScript + Rollup pattern as the other Google/Trello-integrated libs.

- `@aultfarms/overmind` (`libs/overmind/`)
  - Bridges domain models into Overmind-based state management used by some older or more complex apps (notably `apps/inventory-cattle`), including Trello-related providers.

All of these libs depend on consistent TypeScript configs (`@tsconfig/node16`) and share a similar build pipeline; changes in one often imply corresponding changes in others.

### Frontend applications

Representative apps and how they map onto the domain libs:

- `apps/feed/`
  - Vite + React app for entering feed delivery loads into Trello (README describes it as “enters feed delivery loads in Trello”).
  - State initialization (`src/state/initialize.ts`) connects to Trello, loads the feed board, hydrates from `localStorage`, then populates defaults (source/destination/driver) based on Trello-configured settings.
  - Depends on trucking- and trello-related libs to interpret Trello card structures.

- `apps/grain/`
  - Vite + React app for grain hauling; uses a nearly identical initialization pattern to `feed`, connecting to Trello, loading a grain-specific board, and defaulting seller/destination/driver/crop from Trello-driven settings.

- `apps/weights/`
  - React + Vite app for tracking livestock weights and gains in Google Sheets (`README.md` explicitly states this).
  - Depends on `@aultfarms/google`, `@aultfarms/livestock`, and `@aultfarms/trello` for data access and visualization.

- `apps/accounts/`
  - React + Vite app that consumes `@aultfarms/accounts` (and indirectly `@aultfarms/google` and `@aultfarms/livestock`) to present account summaries, charts, and detail views.
  - Its `build:libs` script ensures the core libraries are compiled before building/deploying the UI.

- `apps/treatments/`, `apps/dead/`, `apps/export-treatments/`
  - CRA apps centered around cattle treatments and mortality tracking.
  - READMEs describe how they record tag numbers and treatments into a Trello “Livestock” board and compute stats. `export-treatments` focuses on exporting Trello board data into a single JSON object for downstream analysis.

- `apps/inventory-cattle/`
  - CRA app, bootstrapped with Create React App, that manages cattle inventory.
  - Uses Overmind state (`src/overmind/state.ts`) and a Trello-overmind integration (`aultfarms-lib/trello/overmind/state`), linking it to the same Trello-centric data model as the newer Vite apps.

Other apps under `apps/` follow similar patterns: they are thin UIs over the shared domain libs, Trello, and Google integrations.

### Utilities (`utils/*`)

Utilities are short, focused scripts tailored to specific boards or datasets. For example:

- `utils/grain-trello/index.js` parses card names on the “Grain hauling” Trello board into structured load records (seller, destination, crop, ticket, notes) and prints per-month and cumulative bushel totals.
- `utils/dead-trello/index.js` fetches records from a “Livestock” board, reconstructs tag ranges and groups over time, and computes death statistics per group.

These scripts often embed absolute paths to local configuration (e.g., `~/.trello/token.js`) and assume a particular Trello board layout; treat them as reference implementations or one-off maintenance tools rather than general-purpose libraries.

### Legacy PHP (`php/`)

The `php/` tree contains older PHP sites and scripts that interact with the same Trello boards and farm data, including historical UIs for grain, feed, manure, planting, and house/expense tracking. The modern TypeScript apps and libraries mirror much of this behavior on the client side; when changing behavior, check for corresponding PHP logic to keep data interpretations consistent if both systems are still in use.
