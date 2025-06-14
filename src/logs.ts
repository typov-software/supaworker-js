import type { Database } from './database.types';

export type Log = Database['supaworker']['Tables']['logs']['Row'];
export type LogInsert = Database['supaworker']['Tables']['logs']['Insert'];
export type LogUpdate = Database['supaworker']['Tables']['logs']['Update'];

export const LOG_STATUS = {
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
  RETRY: 'RETRY',
} as const;

export type LogStatus = (typeof LOG_STATUS)[keyof typeof LOG_STATUS];
