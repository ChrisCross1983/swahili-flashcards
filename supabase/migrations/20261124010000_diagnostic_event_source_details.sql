-- Adds only bounded, structured client-error source details. No free messages,
-- full stacks, external URLs, request data or user content are stored.

alter table public.app_diagnostic_events
  add column if not exists source_kind text,
  add column if not exists source_line integer,
  add column if not exists source_column integer,
  add column if not exists error_symbol text;

alter table public.app_diagnostic_events
  drop constraint if exists app_diagnostic_events_message_category_check,
  add constraint app_diagnostic_events_message_category_check
    check (message_category is null or message_category in (
      'aborted', 'resize_observer', 'opaque_script_error', 'network', 'chunk_load',
      'storage', 'permission', 'runtime_type', 'type_undefined_member',
      'type_null_member', 'type_not_function', 'type_illegal_invocation',
      'runtime_reference', 'reference_missing_identifier', 'reference_tdz',
      'runtime_syntax', 'runtime_other', 'unknown'
    )),
  drop constraint if exists app_diagnostic_events_source_kind_check,
  add constraint app_diagnostic_events_source_kind_check
    check (source_kind is null or source_kind in (
      'next_chunk', 'inline_document', 'same_origin_other', 'external',
      'browser_extension', 'browser_native', 'unknown'
    )),
  drop constraint if exists app_diagnostic_events_source_line_check,
  add constraint app_diagnostic_events_source_line_check
    check (source_line is null or source_line between 1 and 10000000),
  drop constraint if exists app_diagnostic_events_source_column_check,
  add constraint app_diagnostic_events_source_column_check
    check (source_column is null or source_column between 1 and 10000000),
  drop constraint if exists app_diagnostic_events_error_symbol_check,
  add constraint app_diagnostic_events_error_symbol_check
    check (error_symbol is null or error_symbol ~ '^[A-Za-z_$][A-Za-z0-9_$]{0,79}$');
