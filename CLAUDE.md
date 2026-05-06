# Lark Base Gantt Chart — Claude Code Handoff

## What this is
A **Lark Base Extension** that renders a custom Gantt chart from a Lark Base table.
It runs as a frontend script inside Lark Base (no backend, no credentials needed —
auth follows the logged-in Lark user automatically).

---

## File structure
```
index.html      ← single deployable file (everything inlined)
src/main.js     ← source JS (bundle this into index.html via esbuild)
```

The final `index.html` has the entire `@lark-base-open/js-sdk` bundled inline (~1MB).

### Build command
```bash
./node_modules/.bin/esbuild src/main.js --bundle --format=iife --minify --outfile=dist/bundle.min.js
```
Then inline `dist/bundle.min.js` into `index.html` replacing the `<script>` block.

---

## SDK
Package: `@lark-base-open/js-sdk`
Import: `import { bitable } from '@lark-base-open/js-sdk'`

### Key API pattern used
```js
const table = await bitable.base.getActiveTable();
const fieldMetaList = await table.getFieldMetaList();   // [{id, name, type}, ...]

// Paginated record fetch
let allRecords = [], pageToken;
do {
  const res = await table.getRecordsByPage({ pageSize: 200, pageToken });
  allRecords.push(...res.records);
  pageToken = res.pageToken;
} while (pageToken);

// Each record: { recordId, fields: { [fieldId]: value } }
// Field values vary by type — see getCellText() / getCellDate() helpers in main.js
```

### Live update listeners
```js
table.onRecordModify(() => refresh());
table.onRecordAdd(() => refresh());
table.onRecordDelete(() => refresh());
```

---

## Field mapping (from user's table)
| Config key   | Lark field name | Type          |
|-------------|-----------------|---------------|
| `item`      | `Item`          | Text          |
| `component` | `Component`     | Single select |
| `status`    | `Status`        | Single select |
| `owner`     | `Owner`         | Person        |
| `startDate` | `Start date`    | Date (ms timestamp) |
| `endDate`   | `End date`      | Date (ms timestamp) |

Defined in `FIELD_NAMES` constant at top of `src/main.js`. Easy to change.

---

## Data shape (user's table)
Components (used for swimlane grouping + color):
- `Operation` → #3B82F6 (blue)
- `Infrastructure` → #A855F7 (purple)
- `Quality` → #10B981 (emerald)
- `Security` → #EF4444 (red)

Statuses:
- `Done` — faded bar (opacity 0.4)
- `In Progress` — full opacity + glow
- `Pending` — dashed border
- `Not Started` — very faint (opacity 0.25)

---

## Deployment
- **Dev**: `npx serve .` → add `http://localhost:3000` as script URL in Lark Base Extensions
- **Prod**: push `index.html` to GitHub repo → GitHub Pages auto-deploys
- GitHub repo name: `lark-base-gantt` (generic, no company name)
- In Lark: Base Extensions → + Add Script → paste URL → Confirm

---

## Current UI
- Dark theme (#080D1A background)
- Font: JetBrains Mono + Syne (loaded from Google Fonts)
- Header: title + legend + item count + Refresh + Fullscreen buttons
- Gantt: sticky timeline header (quarters + months), swimlanes per Component,
  bars colored by component, styled by status, hover tooltip with full details
- Today line: vertical orange marker
- Auto date range: computed from min/max dates in data

---

## Known limitations / what to build next
- No zoom control (currently auto-fits all dates)
- No filter by status or owner
- No click-to-open-record (Lark SDK supports `table.openRecordCreateDialog()` etc.)
- Title is hardcoded as "TECHNOLOGY ROADMAP" — could be made configurable
- Field names are hardcoded — could add a settings panel to map fields dynamically
- Fullscreen uses browser Fullscreen API with a CSS fallback if blocked by Lark's webview
