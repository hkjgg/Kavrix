/**
 * Looking a real certificate up by serial, for `/verify/[serial]` — a public
 * page, so it asks as nobody in particular (the anon key) through
 * `verify_certificate`, which returns only what the certificate prints.
 */

import { createClient } from '@supabase/supabase-js';
import type { CertificateData } from '@/components/viz/certificate';
import { monthLabel } from '@/lib/dates';
import { certificateLegend } from '@/lib/engine';
import type { Database } from '@/lib/supabase/database.types';
import { supabasePublicConfig } from '@/lib/supabase/env';

export interface VerifiedCertificate {
  month: string;
  data: CertificateData;
}

export async function verifyCertificate(serial: string): Promise<VerifiedCertificate | null> {
  if (!/^[0-9]{6}$/.test(serial)) return null;
  const config = supabasePublicConfig();
  if (config === null) return null;
  const client = createClient<Database>(config.url, config.anonKey, { auth: { persistSession: false } });
  const { data, error } = await client.rpc('verify_certificate', { p_serial: serial });
  const row = error === null ? data?.[0] : undefined;
  if (row === undefined) return null;

  const monthName = monthLabel(row.month).toUpperCase();
  return {
    month: row.month,
    data: {
      karat: row.karat,
      tier: row.tier,
      monthName,
      partial: row.partial,
      period: row.period,
      tradeCount: row.trade_count,
      tradingDays: row.trading_days,
      serial: row.serial,
      demo: false,
      legend: certificateLegend(row.karat, monthName, row.partial, row.serial),
    },
  };
}
