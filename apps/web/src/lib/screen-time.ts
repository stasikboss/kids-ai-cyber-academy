import { useEffect, useState } from 'react';
import { rpc } from './supabase.ts';

interface TimeStatus {
  used_seconds: number;
  limit_seconds: number;
  time_up: boolean;
}

const BEAT_SECONDS = 60;

/**
 * Reports visible child-screen time to the database once a minute and returns
 * whether today's limit is used up. The database decides; this only mirrors it.
 */
export function useScreenTime(childId: string | null): { timeUp: boolean } {
  const [timeUp, setTimeUp] = useState(false);

  useEffect(() => {
    if (!childId) return;
    let cancelled = false;

    const beat = async (seconds: number) => {
      try {
        const status = await rpc<TimeStatus>('record_activity', { p_child: childId, p_seconds: seconds });
        if (!cancelled) setTimeUp(status.time_up);
      } catch {
        // Offline for a moment: the next beat catches up (credited up to elapsed time).
      }
    };

    void beat(1);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void beat(BEAT_SECONDS);
    }, BEAT_SECONDS * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [childId]);

  return { timeUp };
}

/** Today's date in Israel as YYYY-MM-DD, matching app.israel_today() in the database. */
export function israelToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
}
