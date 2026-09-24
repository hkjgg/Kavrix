/**
 * `pnpm db:types` — regenerates `lib/supabase/database.types.ts` from the
 * local Supabase database (`supabase start` must be running), with the
 * header that says not to edit it by hand.
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const types = execFileSync('npx', ['-y', 'supabase@latest', 'gen', 'types', 'typescript', '--local'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});
const header =
  '/**\n * Generated from the migrations by `pnpm db:types` (`supabase gen types typescript --local`).\n' +
  ' * Do not edit by hand — change a migration and regenerate.\n */\n\n';
writeFileSync('lib/supabase/database.types.ts', header + types);
console.log('lib/supabase/database.types.ts regenerated');
