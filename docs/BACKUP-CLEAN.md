# Backup Clean

Admin tool that replaced the old **Retention** control in *User Activity*.

## What changed about deletion

**The automatic 30-day delete is gone.** It used to run at server start and every 24 hours,
removing any record older than 30 days without anyone being asked. Nothing is deleted on a
timer any more — data stays until an admin removes it here.

Two small sweeps still run daily, and neither touches anything an admin chose to keep:

| Daily sweep | What it removes |
| --- | --- |
| Orphaned attachments | Files on disk that no note references (abandoned uploads) |
| Expired archives | Soft-deleted records whose 30-day restore window has passed |

## Where it lives

Admin → **User Activity** → **Backup Clean** (red, next to Backup). Admin-only in the UI, and
every route re-checks the role server-side — a non-admin gets `403` even with a crafted request.

## The flow

1. **Month-wise overview** — every month, newest first: record count, size, date range, and a
   per-type chip breakdown. Expand a month for a paginated table (50 rows a page) of its items.
   Search by uploader or file name; filter by type.
2. **Select** either whole months (checkboxes) or a precise **date range** (with
   *Older than 3 / 6 / 12 months* presets).
3. **Live preview** — as soon as the selection is valid, the exact impact appears:
   *"This will archive 72 record(s) (1.4 MB) uploaded between 12 Jul 2026 and 31 Jul 2026 by 3
   users."* Preview, export and delete all call **one shared selector**, so the numbers can never
   disagree with what actually gets removed.
4. **Download backup** — always available, never a gate. If no backup was taken for the current
   selection, a warning line says so; delete still works.
5. **Delete** — the confirmation restates the impact, lists what goes and what stays, and enables
   its button only when you type `DELETE` (case-sensitive). That is the only gate in the flow.

### Safety behaviour (as configured)

| Rule | Behaviour |
| --- | --- |
| Backup before delete | **Optional.** Warning only — *"No backup taken for this range"* |
| Data from the last 30 days | **Warning only.** A tick-box acknowledges it; delete is never disabled |
| Typed `DELETE` | **Required.** The single gate |
| Audit log | **Always written**, for every preview/export/delete/restore |

## Soft vs hard delete

Soft delete is the default. Records move into SQLite's `backup_archives` and
`backup_archive_records` tables; attachment bytes move to `server/data/archive/files/`.
Records are restorable from the **Archive** tab for 30 days. A checkbox on the delete panel
switches to hard delete, which removes the database records and attachment files immediately.

## Concurrency and reliability

- One cleanup runs at a time; a second request gets `409 Another cleanup is already running`.
- The server re-counts before deleting. If the total moved since the preview, it aborts with
  `409 Data changed since preview` rather than removing something the admin never saw.
- Deletion runs detached from the HTTP request in one SQLite transaction — closing the browser
   does not stop it, and the final result stays readable at `GET /api/admin/backup-clean/job/<id>`.
- An attachment shared by more than one note is only unlinked when the last note referencing it
  is gone.
- File paths are built only from server-generated 24-hex ids and are asserted to resolve inside
  the attachments directory.

## Timezone

Report dates are plain `YYYY-MM-DD` calendar strings; everything else uses epoch milliseconds.
Both go through one `anchorOf()` function and are then bucketed with **local** calendar parts
(the server's zone — `Asia/Calcutta` here). Month grouping, the range filter and the preview all
use that same function, so no record can be shown in one month and deleted by another.

## Audit log

`backup_clean_audit` table — append-only, and explicitly excluded from every delete query, so the
tool can never erase its own trail. Each row records the admin, their IP, the
action, the range, record count, bytes, soft/hard, **whether a backup was taken**, job id and
status. Visible in the **History** tab.

## Config

| Env var | Default | Meaning |
| --- | --- | --- |
| `BACKUP_CLEAN_SOFT_DELETE` | `true` | Soft delete pre-selected (admin can still switch per run) |
| `BACKUP_CLEAN_MIN_AGE_DAYS` | `30` | Age below which records are flagged as "recent" |
| `BACKUP_CLEAN_ARCHIVE_DAYS` | `30` | How long soft-deleted records stay restorable |

## Endpoints

```
GET  /api/admin/backup-clean/summary                 month-wise totals + config
GET  /api/admin/backup-clean/items?month=&type=&q=&page=&per_page=
POST /api/admin/backup-clean/preview   { from, to, types, months }
POST /api/admin/backup-clean/export    { … }  → ZIP stream
POST /api/admin/backup-clean/delete    { …, soft, expected_count, backup_taken } → { job_id }
GET  /api/admin/backup-clean/job/:id
GET  /api/admin/backup-clean/archive
POST /api/admin/backup-clean/restore   { file }
GET  /api/admin/backup-clean/history
```

## Restoring from a backup ZIP

The ZIP contains `data.json`, `data.xlsx`, `files/`, `manifest.txt` and `README-restore.txt`.
Full steps are inside `README-restore.txt`; in short:

1. `data.json` is `[{ type, date, record }]` with every field preserved.
2. Stop the server, extract the ZIP, then run `node server/restore-backup-json.mjs
   <extracted>/data.json <extracted>/files`. The importer uses SQLite transactions,
   preserves IDs/units and attachment metadata, and skips records already present.
3. `manifest.txt` carries SHA-256 checksums so you can verify nothing changed.

If the delete was a **soft** delete you do not need the ZIP at all — use **Restore** in the
Archive tab while the record is still inside its 30-day window.
