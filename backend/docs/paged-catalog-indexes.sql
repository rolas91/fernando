-- Optional deployment preparation for growing catalog tables.
-- Review existing indexes and EXPLAIN plans on the deployment database first.
-- Execute these individually, outside a transaction. Do not add them to the
-- current migration runner, which wraps pending migrations in one transaction.
-- No data or existing indexes are removed.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_work_orders_live_project
  ON work_orders (project_id) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_workers_status_page_name
  ON workers (status, first_name, last_name, id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_page_date
  ON projects (start_date, id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_status_page_date
  ON projects (status, start_date, id);
-- Paged submitted forms / incidents and payroll period projections.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_form_submissions_page_submitted
  ON form_submissions (submitted_at DESC, id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_incidents_status_page_date
  ON incidents (status, date DESC, id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_timesheets_internal_payroll_date
  ON timesheets (date DESC, id) WHERE variant = 'internal';
-- Scoped project calendar: review existing indexes and its range-query plan first.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_work_order_shifts_calendar_date
  ON work_order_shifts (date, work_order_id);
-- Daily activity feed and UTC report submission ranges.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_activity_feed_page_timestamp
  ON activity_feed (timestamp DESC, id);
-- Compact status completion lookup (review existing indexes before applying).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_form_submissions_submitted_shift
  ON form_submissions (work_order_id, shift_id) WHERE status = 'submitted';
