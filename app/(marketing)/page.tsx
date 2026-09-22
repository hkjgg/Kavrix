import { redirect } from 'next/navigation';

/**
 * The landing page is Stage 10 (CLAUDE.md §17). Until it exists, `/` goes
 * straight to the one real surface there is.
 */
export default function Home() {
  redirect('/demo');
}
