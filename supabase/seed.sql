SELECT public.execute_schema_tables(
    'supaworker',
    'ALTER PUBLICATION supabase_realtime ADD TABLE supaworker.%I;'
  );