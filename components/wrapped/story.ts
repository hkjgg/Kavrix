/**
 * Wrapped's key map, pure so the tests can hold it (CLAUDE.md §17 Stage 7):
 * → to go on, ← to go back, Home and End for the ends, Esc to leave. Space
 * and Enter are left alone — they belong to whichever button has focus.
 */

export type StoryAction = 'next' | 'previous' | 'first' | 'last' | 'exit';

export function storyKey(key: string): StoryAction | null {
  switch (key) {
    case 'ArrowRight':
    case 'PageDown':
      return 'next';
    case 'ArrowLeft':
    case 'PageUp':
      return 'previous';
    case 'Home':
      return 'first';
    case 'End':
      return 'last';
    case 'Escape':
      return 'exit';
    default:
      return null;
  }
}
