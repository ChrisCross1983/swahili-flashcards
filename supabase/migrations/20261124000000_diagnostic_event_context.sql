-- Privacy-safe client runtime context. Values are fixed categories or sanitized
-- same-origin paths; raw messages, full stacks and external URLs are not stored.

alter table public.app_diagnostic_events
  add column if not exists browser_version text,
  add column if not exists event_type text,
  add column if not exists error_name text,
  add column if not exists message_category text,
  add column if not exists rejection_type text,
  add column if not exists stack_origin text,
  add column if not exists top_frame text,
  add column if not exists same_origin boolean,
  add column if not exists source_hint text,
  add column if not exists navigation_state text,
  add column if not exists online boolean,
  add column if not exists visibility_state text;

alter table public.app_diagnostic_events
  drop constraint if exists app_diagnostic_events_browser_version_check,
  add constraint app_diagnostic_events_browser_version_check
    check (browser_version is null or browser_version ~ '^[0-9.]{1,20}$'),
  drop constraint if exists app_diagnostic_events_event_type_check,
  add constraint app_diagnostic_events_event_type_check
    check (event_type is null or event_type in ('window_error', 'unhandled_rejection', 'react_boundary', 'network_request', 'api_response', 'manual')),
  drop constraint if exists app_diagnostic_events_error_name_check,
  add constraint app_diagnostic_events_error_name_check
    check (error_name is null or error_name in ('Error', 'TypeError', 'ReferenceError', 'SyntaxError', 'RangeError', 'URIError', 'AbortError', 'TimeoutError', 'DOMException', 'Other', 'Unknown')),
  drop constraint if exists app_diagnostic_events_message_category_check,
  add constraint app_diagnostic_events_message_category_check
    check (message_category is null or message_category in ('aborted', 'resize_observer', 'opaque_script_error', 'network', 'chunk_load', 'storage', 'permission', 'runtime_type', 'runtime_reference', 'runtime_syntax', 'runtime_other', 'unknown')),
  drop constraint if exists app_diagnostic_events_rejection_type_check,
  add constraint app_diagnostic_events_rejection_type_check
    check (rejection_type is null or rejection_type in ('error', 'dom_exception', 'string', 'object', 'primitive', 'null', 'not_promise')),
  drop constraint if exists app_diagnostic_events_stack_origin_check,
  add constraint app_diagnostic_events_stack_origin_check
    check (stack_origin is null or stack_origin in ('same_origin', 'external', 'browser_extension', 'browser_native', 'unknown')),
  drop constraint if exists app_diagnostic_events_top_frame_check,
  add constraint app_diagnostic_events_top_frame_check
    check (top_frame is null or (char_length(top_frame) between 1 and 180 and top_frame like '/_next/static/%' and top_frame !~ '[?#]')),
  drop constraint if exists app_diagnostic_events_source_hint_check,
  add constraint app_diagnostic_events_source_hint_check
    check (source_hint is null or source_hint in ('global', 'react_boundary', 'api_client', 'trainer', 'ui', 'unknown')),
  drop constraint if exists app_diagnostic_events_navigation_state_check,
  add constraint app_diagnostic_events_navigation_state_check
    check (navigation_state is null or navigation_state in ('active', 'unloading', 'page_hidden', 'restored')),
  drop constraint if exists app_diagnostic_events_visibility_state_check,
  add constraint app_diagnostic_events_visibility_state_check
    check (visibility_state is null or visibility_state in ('visible', 'hidden', 'prerender', 'unknown'));
