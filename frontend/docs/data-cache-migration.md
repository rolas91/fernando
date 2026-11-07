# Application data cache and loading policies

AppContext remains the compatibility layer for existing screens and mutation handlers. Server collections come from TanStack Query through useAppData; navigation and form state stay local. The existing mutation API calls, payloads and action bodies are unchanged.

## Page loading

appDataPages.ts declares the dependencies of all 20 pages, including nested dialogs, lookup helpers and mutation prerequisites. Only the active page and the shared shell enable their queries. Closed modules remain cached and are marked stale by events without being downloaded.

The shared shell loads settings, notifications and a pending-timesheet summary. Screens that already require timesheets derive the badge from those rows and skip the redundant summary request. The summary reuses the existing reconciliation and internal-timesheet rules; it does not count client variants. Header may optionally enrich chat titles from cached assignments/projects; server-generated notification titles remain its fallback, so this enrichment never triggers a full assignment download.

Dashboard now enables only the three shared-shell queries plus one dedicated daily read. Its daily snapshot has a separate date/activity-page key and advances at local midnight. It does not request or overwrite complete operational collections. Reports likewise uses a dedicated period/section/page read instead of enabling its former historical collections.

A page mounts after its declared collections have data, preventing forms from capturing empty initial defaults while their dependencies load. Previously loaded data remains visible during background refresh. A failed required collection displays a recoverable error while navigation to other modules remains available.

## Assignment range contract

GET /api/work-orders accepts optional from/to calendar dates. Both dates are required when filtering; malformed, impossible and reversed ranges are rejected. The SQL selects assignments with at least one shift in the inclusive range and preserves the existing soft-delete filtering. Returned assignments include all sibling shifts, even outside that range.

Without dates, the endpoint retains its existing complete-list behavior. Schedule and editable Assignments continue to use complete collections for cross-project conflicts, week copying, bulk actions and full-assignment save payloads. Shifts now opens one complete assignment on demand; scoped project/form workflows are described in their respective sections. Restricting Schedule to its visible week requires a separate conflict index and targeted mutation endpoints; this migration intentionally does not remove those protections.

## Cache lifecycle and updates

- Keys are scoped by user, resource and optional read-only date range. Private queries are disabled without a signed-in user.
- Index remounts AppProvider when the session owner changes. Cleanup cancels reads, removes that owner's application cache, disconnects realtime and cancels queued refreshes. Old mutation completions cannot repopulate an unmounted session.
- Resource freshness is configured individually. Only network/server failures retry, up to twice. Authorization and validation failures do not retry.
- Existing state setters update the query cache and cancel older reads before applying mutation results. Full-assignment writes invalidate scoped dashboard snapshots while retaining their complete cache.
- Structural sharing remains disabled specifically for assignments. Existing Schedule/Shifts effects use a refreshed assignment reference to reload server-derived completion/status statistics, even when the assignment payload is unchanged.
- Realtime coalesces events for 200 ms and invalidates affected resource keys, including their date ranges. Disabled queries become stale without fetching; active views refresh. Reconnection reconciles active collections. Live reflects socket connectivity separately from HTTP data availability.
- Mutation readiness remains tied to the action's own collection. Scoped dashboard assignment snapshots are read-only and never authorize assignment mutations.
- Operational data is not persisted to browser storage.

## Validation

Frontend:

- node scripts/test-app-data-cache.cjs
- node scripts/test-page-data-dependencies.cjs
- node scripts/test-copy-week.cjs
- node scripts/test-cancellation-indicators.cjs
- node scripts/test-bulk-shift-worker-conflicts.cjs
- node scripts/test-work-order-pdf-export.cjs
- node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
- node node_modules/vite/bin/vite.js build

Backend:

- node node_modules/jest/bin/jest.js --runInBand work-orders.service.spec.ts work-order-list-range.util.spec.ts work-order-shifts-write.service.spec.ts
- node node_modules/typescript/bin/tsc --noEmit -p tsconfig.build.json

The page-dependency check walks the actual application route switch and imported component trees, including nested dialogs and mutation prerequisites. Backend SQL tests inspect parameter binding, inclusive dates and soft-delete filtering without connecting to a database.


## Server-paginated independent catalogs

Clients, Equipment and Materials now use dedicated queries under app-data / user / resource / page / page-number / filters. They load 25 records per request; none enables its full collection in AppContext. Clients also no longer downloads the complete Projects collection for card counts.

The paged endpoint applies case-insensitive literal substring search over the same fields as the previous frontend filters, plus status/type filters where supported, before counting and slicing. Ordering is deterministic: client name or natural numeric equipment/material identifier, with name and ID tie-breakers. Global status counts and total inventory counts remain global. Client project counts are grouped in one query for the displayed IDs. Read permissions are resolved to the underlying resource for paged lists, summaries and exports.

The existing dialogs retain their validation and submit payloads. A narrowly scoped AppContextOverride supplies the displayed records and the existing API mutations only inside that list's dialogs; partial pages never replace complete Schedule collections. Successful writes invalidate the resource's cached lists and complete lookups. Failed writes retain the current data. Filters reset pagination, deletion of the last item can return to the preceding page, and importing explicitly refreshes the catalog.

Material selection is explicitly limited to the current page; bulk deletion retains the same selected-ID request and server safeguards. Export retrieves all matching records from a separate endpoint on demand, without a page limit, then uses the existing CSV formatting. Export failures do not produce empty downloads.

Schedule with cross-project conflict checks and the other dependent operational modules have not been connected to generic paged row queries. Workers/Projects list migration and their deliberately deferred detail workflows are described below. Their full-data dependencies must be migrated individually rather than silently truncating those collections.

Additional checks:

- node scripts/test-paged-catalog-exports.cjs
- node node_modules/jest/bin/jest.js --runInBand paged-catalog.util.spec.ts paged-lists.controller.spec.ts operations-auth.guard.spec.ts


## Workers and Projects: paged lists with complete detail compatibility

Worker list requests page 25 base worker IDs after applying status and legacy-type/assigned-role filters. Search includes role names through a correlated aggregate; role filters use EXISTS so multiple roles cannot duplicate workers or inflate totals. Only that page is hydrated with the existing WorkersService serializer, including skills, roles, certification assignments, expiration dates, uploads and existing profile fields. Large exports hydrate IDs in batches of 500. View/edit maintains an individual worker query under the same user-scoped resource prefix, so an open record can remain available after it leaves the current filtered page. Page records take precedence over older detail-cache snapshots when opening a form.

Project list search includes client names and preserves the existing concatenation of searchable fields. Date/name/status sorting is performed by the server with an ID tie-breaker; status order comes from the active configured catalog with the same fallback statuses. Date ordering keeps missing dates first ascending and last descending. Page responses include only related client IDs/names and aggregate assignment/worker counts. Worker counts retain the previous semantics: distinct workers per assignment, summed across the project's assignments, rather than distinct workers across the whole project. Soft-deleted assignments are excluded.

Initial Project list loading does not enable complete Projects, Clients, Workers, Equipment or Assignments collections. Opening New Project requests only complete client options needed by the unchanged form. Project details, Calendar and Board now use the scoped read models described below. New/Edit Project requests complete client options only while its existing dialog is open; it no longer enables complete projects, assignments, worker profiles or equipment history.

Client, assignment and status-catalog events invalidate project pages so labels, counts and ordering update. Role, skill and certification events invalidate worker queries. Partial page responses never seed or overwrite complete shared collections used by Schedule.

The existing database migration runner uses one transaction for pending migrations. Optional concurrent indexes for catalog growth are prepared separately in backend/docs/paged-catalog-indexes.sql; they have not been executed. Inspect the deployment database's existing indexes/query plans before applying those statements outside a transaction.

Additional compatibility tests:

- Backend: node node_modules/jest/bin/jest.js --runInBand paged-workers-projects.spec.ts
- Frontend: worker CSV export is included in scripts/test-paged-catalog-exports.cjs

## Submitted forms, incidents and payroll reports

Submitted forms use 25-row server pages, template-name search, and a lightweight count for the tab badge. The default Templates tab does not request submission pages. List reads omit the `data` JSON column for unrestricted users, and responses never contain response bodies. Opening a visible submission requests its full record under a user-scoped record key; the detail read applies the existing actor visibility rule. Submitter labels and project/assignment names are projected only for the displayed IDs and only with the corresponding read permissions. The previous full `/users` download has been removed. FormBuilder's assignment preview loads complete assignments only when the builder opens; the preview-only dialog does not request payroll/worker history. Existing builder, preview and submission-detail implementations remain intact.

Restricted mobile viewers retain the legacy timesheet visibility rule, including nested JSON rows and the existing behavior when no linked worker exists. That rule is applied before both counts and page slicing. This branch still inspects submissions on the server; moving it fully into SQL requires a separately validated indexed ownership projection. It never sends the complete history to the browser.

Incidents use server search/status filters, 25-row pages and global status counters. Existing submission-to-incident reconciliation runs before reading pages. Page responses include only related project/reporter labels. The existing dynamic report form and status-change payloads remain intact; complete assignments are deferred until the report form opens. Successful incident writes refresh incidents and submitted-form caches. Submission deletion also invalidates related incidents, payroll, the pending badge and assignments, preserving server locking/approval safeguards.

Timesheets uses `/timesheets/reports/payroll` and a separate on-demand `/export` endpoint. The browser receives seven detailed rows, complete filtered period totals, compact worker/project summaries, filter options and up to three recent references per worker. No raw timesheet history, signatures, notes or full assignments are downloaded on screen entry. Export fetches all matching calculated rows and retains the existing CSV/Excel column formatting.

The payroll calculation is a pure backend function migrated from the previous view. Eligibility remains internal timesheets on PM-approved shifts of non-deleted assignments. Regular/overtime/double-time hours, premiums, multipliers, role-based display times, fallback shift types, deduplicated display counts and current worker rates keep their previous semantics. The report requires the same source read permissions, including wage settings. The frontend supplies its local calendar date so server timezone differences do not shift week selection.

Date bounds are an aggregate query over all eligible history. Weekly/custom reads bind date bounds in SQL before loading only the projected payroll inputs. The default `all` mode is preserved: its full-history totals still require processing all eligible projected inputs on the server. Row slicing occurs after complete report calculations, so pagination cannot reduce totals to the visible page. Further database-side payroll aggregation or shared report caching should be measured and validated separately; this phase does not introduce Redis or a stale server snapshot cache.

All query keys remain under the signed-in user's resource prefix. Payroll is invalidated when workers, projects, assignments, shift templates or company settings change; page labels/counts also follow related realtime events. Pages do not overwrite the complete collections used by Schedule. Existing Schedule mutations and conflict calculations were not changed in this batch.

Additional validation:

- `node scripts/test-payroll-parity.cjs`: compares the new function against a frozen copy of the previous FE calculation in 12 scenarios, including duplicates, night premiums, missing lookups, future approved dates, filters, date bounds and complete totals.
- `node scripts/test-app-data-cache.cjs`: 26 checks, including bounded entry reads and unchanged incident/submission mutation payloads.
- Backend `payroll-report.controller.spec.ts` and `paged-forms-incidents.spec.ts`: compact responses, totals independent of page, full export, permissions, date validation, SQL date binding, actor visibility before pagination and literal incident search.
- Existing Schedule compatibility scripts, page-dependency checks, catalog exports, frontend/backend type checks and production frontend build.

No deployment or database/index execution has been performed. Browser interaction testing remains pending because the local browser automation runtime could not initialize in this environment. Optional indexes are documented separately for deployment review; production query plans and realistic-volume timings remain necessary before claiming a measured performance improvement.


## Projects: scoped detail, calendar and board

The calendar calls GET /projects/views/calendar with the inclusive first/last dates actually displayed by the existing week/month calculation, including adjacent-month cells. The endpoint requires a valid range of at most 62 days and applies the same literal search, status filtering and configured sorting as the paged list. Projects are included through actual relational shifts in that range, regardless of their overall project dates. It excludes soft-deleted assignments and returns only project metadata, related client IDs/names and per-project/per-day shift and distinct-worker counts. Counts use DISTINCT to prevent role/worker joins from multiplying shifts. No full assignments or worker/equipment profiles are requested. All matching projects in the displayed period are returned: the calendar never silently truncates at the list's 25-row limit. Very dense calendars still need realistic-volume measurement; there is no artificial record cap that hides scheduled work.

The Board uses independent 25-row pages per configured status column, with server-side search/sorting and complete filtered counts on each column. Inactive columns under a global status filter do not fetch. Changing a filter resets the effective page, and a column whose last page becomes empty clamps back after a successful update. Drag-and-drop retains its existing project-status PATCH and error handling. Server-projected assignment counts replace complete assignment downloads. The global list/status metadata is shared through its existing query prefix.

Selecting a project calls GET /projects/:id/views/detail?page=N. It returns the full selected project metadata, one client label, 25 projected assignment summaries and the total assignment count. Summaries contain original assignment dates, shift count, assigned worker slots and required worker slots; they do not contain editable shift payloads. The separate worker count covers all live assignments in the project, independently of the assignment page. Up to eight existing worker profiles are projected to ID/name/type, with a stable alphabetical order; IDs that have no profile remain excluded from the worker preview/count, matching the previous lookup behavior. The UI retains its eight-worker preview and remaining-worker count. Detail cards still navigate to the existing Assignments/Schedule screens for editing.

The individual project record query and complete client options support the unchanged New/Edit dialogs. An editor chooses the newest complete project metadata already available across list/board/calendar/detail/record snapshots before initializing its fields. Scoped records never seed or replace the complete global Projects or Work Orders collections. New/Edit modal implementations, status-change payloads, date navigation and date-grid calculations are frozen in a compatibility fixture and compared by the test script.

Calendar/detail/record keys live under app-data / user / projects alongside the existing board/list page keys. Project writes invalidate the full projects prefix. Client, assignment, worker and status-catalog events cancel outdated scoped reads before invalidating project pages/calendars/details; user-session cleanup removes them with the rest of that user's queries. Schedule's complete assignment keys and structural-sharing behavior remain unchanged.

Validation for this phase:

- Backend project-views.controller.spec.ts: six cases covering inclusive/range-limited SQL, literal filters, configured sort, soft deletions, role-join cardinality, global totals with page 2, projected profiles, empty results, missing projects, validation and source-data permissions.
- Frontend test-project-view-compatibility.cjs: unchanged New/Edit forms and drag/status payloads; week/month grids across adjacent months, year boundaries and leap years.
- Frontend test-app-data-cache.cjs: 28 cache/lifecycle checks, including scoped period/detail keys, request deduplication, user isolation and freshest editor snapshots.
- Existing Schedule, payroll parity, catalog-export, page-dependency checks, type checks and production build.

This phase adds no database migration and performs no deployment. Client option search/pagination inside project forms remains a later shared-selector improvement. Browser interaction testing and realistic-volume query-plan/timing checks remain pending.


## Dashboard and Reports: daily snapshots and period summaries

Dashboard calls GET /work-orders/views/dashboard with an explicit local calendar date, UTC instants for the browser's local midnight boundaries, and an activity page. Day-boundary validation accommodates daylight-saving days and prevents historical activity windows. SQL selects only non-deleted assignments with non-cancelled shifts on that date and excludes both cancelled/canceled assignment spellings after trimming/case normalization. The existing shift serializer now accepts an optional internal read-only range that bounds shift rows, roles, assigned workers and cancellation lookups. Calls without that argument retain complete shift reads for Schedule, editable assignments, bulk operations and PM-lock checks.

The daily response contains all of the day's matching assignments/shifts needed by the existing map/cards; it never truncates the map to one page. It fetches only the associated projects/clients, active/total equipment counts, today's internal pending timesheets, today's open/investigating incidents, six projected active assigned-worker previews, and 25 local-day activity items with a complete count. The raw assigned-ID numerator still includes inactive/missing profiles, as the old Dashboard did; the preview remains restricted to existing active workers. Planned equipment retains duplicate-type sums, quantity coercion and negative-quantity clamping. Global inventory/active-worker denominators remain global. The unchanged JobsMap receives a scoped context only inside Dashboard; daily shifts never replace the complete shared assignment cache.

Reports calls GET /timesheets/reports/operations for a validated inclusive date range and overview/worker_hours/project_summary section. The default remains the last 30 local calendar days, with existing presets unchanged. SQL loads only internal timesheet payroll inputs in the selected period, minimal referenced worker/project metadata, overlapping live assignment metadata, and the shift timing/name inputs needed by that period's timesheets. Assignment inclusion preserves the old date-overlap OR actual-shift-overlap rule. Timing lookups outside the period are retained when a period timesheet references them; unrelated shift histories and editable payloads are excluded.

The server preserves Reports' own estimation formula. It includes pending/rejected and non-PM-approved internal hours, unlike the separate payroll screen. Active-worker utilization excludes inactive workers; project costs still include their hours/rates when a worker profile exists, and orphan/missing-worker timesheet hours retain their old treatment. Totals and worker footer values cover the whole period, independent of the 25-row table page. Overview returns only the top eight utilization rows. A separate /export endpoint returns every calculated worker/project row for the selected period on demand and uses the existing CSV columns/formatting.

Equipment status counts remain current global counts. Incident counts are aggregated for the period. Submitted-form counts use the same actor visibility rules, including unknown-template submissions in the global form count. Unrestricted form counts are grouped directly in SQL without reading JSON response bodies; restricted viewer ownership checks inspect only the selected period's submissions. Submission ranges use UTC instants to preserve the previous ISO submittedAt date-key rule, while Dashboard activity uses the browser's local day. These two pre-existing date semantics are deliberately distinct.

Important existing Reports issue recorded for a separate correction: worker rates from the numeric database column can arrive as decimal strings. Reports previously used JavaScript addition directly for the regular/night rate; e.g. '20.00' + 3 becomes '20.003' before multiplication. This phase preserves that existing result, including it in parity fixtures, rather than silently changing estimated pay while migrating data loading. The Timesheets payroll calculator already normalizes rates and is not changed here. Correcting Reports' rate normalization should be a separate, explicitly reviewed financial-calculation change before deployment.

Daily keys live under app-data/user/workOrders/dashboard; Reports and export keys live under app-data/user/timesheets/reports and reports-export. No snapshot seeds the complete root keys. Related realtime events cancel/invalidate the active read scope; inactive views become stale without being fetched. Export requests participate in session cancellation and do not trigger downloads after the screen/session has unmounted. No operational records are persisted in browser storage.

Validation for this phase:

- test-operations-report-parity.cjs: ten frozen-FE Reports comparisons (including decimal strings, empty/missing data, inactive workers, fallback multipliers, premiums, date overlap and full totals), four Dashboard allocation comparisons and unchanged local date presets.
- test-summary-exports.cjs: all 80 filtered worker/project rows exported instead of one displayed page, with no download after failure.
- test-app-data-cache.cjs: 29 checks, including the absence of historical root loads, scoped day/range/page keys, deduplication and session isolation.
- summary-reads.controller.spec.ts: six contracts covering restricted source queries, complete totals with page 2, compact overview, complete exports, source permissions, day boundaries, feed pagination and validation.
- shifts-query.service.spec.ts: existing serializer/confirmation/resource checks plus explicit proof that default batch reads remain complete and only opt-in ranged reads add date predicates.
- paged-forms-incidents.spec.ts: SQL form grouping and existing viewer ownership checks within the selected UTC period.
- Existing Schedule, payroll, Projects, export and page-policy checks, plus frontend/backend types and production frontend compilation.

No deployment, live database query or index execution was performed. Existing submission reconciliation still scans historical submissions on the server before report reads; that separate optimization remains outstanding. Very broad custom report ranges still require processing all relevant projected inputs on the server. Realistic-volume query plans/timings and browser interaction testing remain pending; the new endpoints bound initial browser data without claiming measured production latency.


## Shifts pagination and shared status reads

Shifts now uses dedicated user-scoped reads under workOrders/shifts-page, workOrders/shifts-metrics and workOrders/shift-detail. Its initial page enables only settings, shift templates and form templates plus the shared shell. It no longer enables complete assignments, submissions, projects, clients, worker profiles, equipment or materials. The page read returns 25 shift records after literal search, independent project-number/project-name filters, effective-status filtering and validated inclusive dates. Existing All dates behavior is retained. Parent assignments retain their previous latest-shift/start-date ordering through a grouped aggregate; complete row records are hydrated only for selected shift IDs. Parent metadata in list responses intentionally has an empty shifts array and must never be used as a writable assignment snapshot.

List/calendar modes share the same result cache. The Board requests independent 25-row status-column pages in one backend request and one compact status-index computation, rather than filtering one global page into misleading empty columns. Column counts cover the complete filtered result, pages reset on changed filters, and empty trailing pages clamp back. Global status chips and project/export selectors come from a separate metrics query over all live shifts, preserving the old global-count semantics regardless of the current list page/date filter. PM-approved export projects are not restricted to projects visible on the current page. The unchanged PDF export handler still retrieves the complete server-generated export for the selected project/status/dates.

Opening a shift requests its complete assignment, its associated project/client and only submissions for that shift plus legacy assignment-wide submissions with a blank shift ID. The original actor visibility rules remain applied. This retains existing legacy PDFs while excluding unrelated sibling-shift form bodies. The original ShiftDetailView still uses its existing targeted save/approve/reopen/timesheet/document APIs. It is mounted only after the scoped record and deferred worker/equipment/material catalogs are ready, preventing empty initial edit state. Complete worker/inventory selectors are intentionally deferred until detail opening, not silently replaced with the displayed row's assigned IDs. The browser's full global assignment cache is never populated with list pages or truncated records. Hidden list/metrics observers are disabled while the detail is open; detail refresh still invalidates the shared assignment prefix and the list becomes fresh when reopened.

The shared ShiftStatusService.computeStats no longer loads every full assignment and then makes a relational hydration request for each one. It uses four projected queries for shifts, roles, worker confirmations and submitted-form identifiers. Supplied date bounds are applied in SQL before processing those inputs, including open-ended stats ranges. No complete submission JSON, project history payloads, inventory, uploads or editable role payloads are needed for this computation. The existing computeShiftStatus and aggregateShiftStatuses functions remain authoritative and unchanged: PM/future-date rules, manual lifecycle behavior, cancellation, confirmations, missing slots and the existing submitted-form completion interpretation are preserved. This optimization also benefits Schedule's current day/week status requests without changing its edit data source.

Only the timezone formatter is cached inside businessDate; neither the current business date nor a classification result is cached. Changing BUSINESS_TIME_ZONE refreshes the formatter, and midnight/date changes continue to be calculated from the supplied/current instant. Page/metrics reads retain the standard 30-second client freshness and realtime invalidation; no stale server-side status cache was introduced. Assignment, submission, project, client and worker events refresh relevant Shifts reads; user-session cleanup removes the scoped keys. The existing complete-reader default remains unchanged: optional date/selected-ID arguments are opt-in read projections only, and editing paths continue to retrieve all sibling shifts.

Validation:

- shift-status-read.util.spec.ts: seven cases covering projected-to-legacy classifier/counter parity, SQL range binding and soft deletions, four-query stats without per-assignment hydration, 25-row page hydration, literal search and independent project filters, complete global metrics/export options, independent board-column pagination in one index read, full detail with approved siblings, permissions/validation and date/timezone transitions.
- shifts-query.service.spec.ts: five checks covering existing confirmations/resources, complete reads by default and opt-in date/ID bounds for projected reads.
- paged-forms-incidents.spec.ts: selected-shift plus legacy assignment-wide document lookup with existing actor ownership checks.
- test-shifts-read-compatibility.cjs: unchanged status labels, creator fallback, relative week calculation, shift-type labels and PDF export payload/validation.
- test-app-data-cache.cjs: 30 checks including bounded initial Shifts reads, separate global metrics, on-demand record keys, request deduplication, user isolation and absence of partial writable-root seeding.
- Existing copy-week, worker-conflict, cancellation, PDF, payroll, report, project, backend write/PM-lock tests, type checks and production frontend compilation.

Remaining work is explicit: Schedule and editable Assignments still retain complete assignment collections. Their helpers inspect other assignments and submit whole shift arrays, including copy-week destinations outside the currently displayed week. Replacing those collections requires a separately validated conflict/read index and a full-record save strategy; this phase does not trim them or claim their migration is finished. Global Shifts metrics/All dates still classify compact history on the server, so realistic-volume measurement remains necessary. Complete detail selectors and on-demand PDF export may also require further targeted optimization. Browser interaction QA and deployment/database-index execution remain pending.


## Schedule/Assignments: completion index and on-demand document metadata

Schedule and editable Assignments no longer enable the complete formSubmissions root collection on entry. Their assignment records and all sibling shifts remain complete for the unchanged cross-assignment conflict checks and whole-array saves. This is a separate, completed reduction in submitted-form loading; it does not claim that assignment-history pagination is finished.

Schedule calendar calls GET /form-submissions/views/schedule-index. SQL restricts the read to submitted responses and, for unrestricted readers, selects only id, workOrderId, shiftId, templateId and status. No answer JSON, signatures or PDF links are transferred in that index. The existing frontend buildCompletedWorkOrderShiftKeys algorithm remains unchanged apart from accepting its precise identifier-only input type: required selected templates, optional templates, future dates, matching assignment/shift IDs and submitted status retain their old interpretation. Missing initial completion data blocks calendar rendering with a loading/error and retry state; a failed request must never become an empty success that unlocks edit controls.

The assignment sidebar and editable Assignments detail request GET /form-submissions/views/assignment/:workOrderId only when selected. SQL binds that assignment ID and returns all matching response metadata/PDF URLs, including draft responses and legacy blank-shift records, without answer JSON. Existing ordering, template/worker labels, per-shift grouping, public PDF URLs and links remain unchanged. Loading/error/retry feedback is displayed in the document area without resetting edit state. Selecting another assignment uses a distinct key and does not retain the previous assignment's documents as a placeholder.

Both endpoints retain form-submissions.read permission and the existing actor visibility policy. For legacy own-timesheet viewers, the server still loads the relevant response JSON before applying nested ownership rules, then strips it before returning metadata. Do not remove that server-side ownership inspection as a payload optimization. Unrestricted index and document queries project away JSON in SQL. The complete form/detail APIs and all mutations are unchanged.

Query keys live under app-data/user/formSubmissions/schedule-index and assignment-documents/assignmentId. The existing submitted-form realtime event cancels outdated reads and invalidates that prefix; inactive documents do not refetch. Keys inherit session cleanup, cancellation, user isolation, 30-second freshness and the standard retry policy. Neither response seeds the complete formSubmissions or workOrders root cache.

Validation: eight backend submitted-form/incidents contracts (including source permission, compact projections, assignment scoping, empty IDs and own-viewer visibility); 43 passing backend checks including assignment writes, PM locks and complete shift serialization; 31 cache/realtime checks; all 20 page dependency policies; compatibility comparison of 25 unchanged action callbacks and submitted-form completion parity; copy-week, worker-conflict and cancellation regression checks; frontend/backend types and production frontend build.

Remaining: Schedule/Assignments still download complete assignment history and selector catalogs. Replacing that safely requires a cross-assignment conflict read index plus complete-record loading before edits, including copy-week destinations outside the visible week. The global compact completion index also still grows with submitted history. Range/index migration must preserve validation across dates rather than silently filtering its inputs to one page. Browser interaction QA and realistic-volume database query-plan/timing checks remain pending. No deployment or database migration/index execution was performed in this stage.


## Schedule calendar and Assignments: 25-row navigation with complete writable parents

The default Schedule calendar no longer enables the complete workOrders root history. GET /work-orders/views/assignments/schedule-scope receives the exact one/seven date keys from the unchanged calendar calculation. SQL includes parents whose assignment date range overlaps the displayed dates OR which have actual shifts on those dates, retaining empty in-range rows for adding shifts. Only projected parent metadata and shifts inside that period are read. The response is marked readOnly and includes each parent's latest shift timestamp across its entire history solely to preserve existing row ordering. No unrelated historical parent/shift collection is downloaded on entry.

Schedule keeps its existing search/project/strip/effective-status filters over this period snapshot, preserving the exact filter callbacks. The snapshot covers all rows in the week so summary counters, day totals and filter matches remain independent of the displayed page. Seven day columns stay visible. The selected 25 parent IDs are sent to /records; that endpoint hydrates complete parent records with every sibling shift through the existing serializer. Paging does not truncate a writable shift array. Up to seven additional currently open editor/sidebar/chat records can be pinned, for a validated maximum batch of 32 IDs. The period snapshot is never used as a save source or inserted into the root workOrders cache.

Week/day navigation is unchanged. The period is part of the query key, so previous/older weeks load their own data and revisits reuse the standard 30-second cache. Changing the period, project, search, strip or status resets the effective page to one and clears the page's shift selection. A deleted final row clamps a trailing page. The row viewport returns to the top on changed pages/filters while retaining the date columns. Initial load failures show a retry instead of editable placeholder rows. Existing complete records may bridge a page transition only for IDs explicitly requested; unrelated old-page rows are never rendered in the new week.

Assignments calls GET /work-orders/views/assignments/page with page, search, sort, optional selected date bounds and optional displayed calendar-grid bounds. Search retains the original concatenation of assignment title/project/client/city/order/type text and literal substring behavior, including percent/underscore characters. Date bounds preserve assignment-overlap OR actual-shift-overlap; the calendar adds the actual displayed shift-date constraint because its original cells show assignments through their shifts. Calendar week/day/month construction and navigation remain unchanged. Full rows are hydrated only for 25 selected parents; a selected detail/chat can load its own complete record independently. Totals cover the full filtered result and the header count covers all live assignments. Optional catalog denial does not discard assignments: protected project/client/type labels are omitted from backend search/sort inputs just as missing frontend catalog lookups previously produced empty labels.

To retain browser localeCompare sorting without changing its behavior during migration, Assignments currently reads projected matching ID/date/project-name sort keys on the server, sorts those keys, then hydrates only the requested page. This bounds browser/editable data but still processes matching metadata on the backend; realistic-volume plans/timings and a compatible indexed sort remain performance follow-up work. Schedule similarly retains all shifts in the displayed period for exact existing summaries, rather than claiming that a 25-row UI means only 25 weekly summary rows exist.

Opening a Quick Add/Edit Shift form loads a separate read-only conflict index over live assignments, across all pages/dates. SQL projects only assignment IDs/status/labels, shift dates/times/status/cancellation, role start times and assigned worker IDs/confirmation status. Keeping confirmed/declined states is necessary for the unchanged weekly workload and rest-hour helpers, including overnight work. Existing conflict conditions are unchanged; only their read collection changes. A fresh successful index is required on first opening the editor, and background refreshes preserve local form state. The index is never writable. Same-assignment bulk creation/copy validation continues to inspect every sibling shift in the complete selected parent.

Chats opened through notifications resolve a complete assignment by assignment ID or shift ID, including turns outside the current page/week. These reads use the same user-scoped cancellable query prefix and ignore results after unmount. The original complete-history reader remains available only when the user explicitly chooses the legacy Schedule list/timeline views; those alternate modes are not silently changed in this calendar-pagination stage.

The root mutation contract retains its existing normalization and changedShiftIds calculation. It obtains the newest complete record snapshot from complete page/detail caches (or the existing complete record endpoint when necessary), never from range/conflict projections. Successful writes update already cached complete records immediately before invalidating scoped reads, preserving sequential edits without waiting for a background reload. They do not insert new assignments into unrelated pages and do not create a fake complete root history when none was loaded. Existing full-root consumers retain their state-setter behavior. PM/write validators and backend operational mutations are unchanged.

All keys live under app-data/user/workOrders: schedule-scope/date bounds, assignment-records/IDs, assignments-page/filters/page, assignment-record/ID, assignment-shift-record/shift ID and conflict-index. Work-order mutations/events refresh this prefix. Project/client/type/worker/submission changes invalidate related scoped reads; inactive weeks/pages become stale without downloading. Session cleanup/cancellation remains shared.

Validation includes eight new backend read contracts with real TypeORM SQL generation (no live database), complete page/sibling hydration, literal filters, global totals, date/grid scopes, permissions/catalog fallback and cross-page confirmation projections; existing backend assignment-write/PM-lock/serialization tests; 33 cache/realtime checks; all 20 page dependency checks; frozen comparisons of navigation, date grids, status filters, conflict conditions and 23 unchanged action callbacks; cross-page rest/workload parity; real pagination markup; page reset/clamp and actual context-writer payload checks; existing copy-week, bulk-worker-conflict and cancellation regressions; types and frontend production compilation.

The browser connection could not start in this environment. Visual/live interaction QA (week back/forward, page changes, open editor, delete last page, notification chat and Save) and realistic production-volume timings remain pending. No deployment, live database operation, migration or index execution was performed.
