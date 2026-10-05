import catalogJson from '../../../../content/catalog.json';
import type { AgeBand, Lang, Plan } from './types.ts';

export interface Track {
  id: 'ai_literacy' | 'cyber_safety' | 'ai_security';
  title: Record<Lang, string>;
  plan: Plan;
  minAgeBand: AgeBand;
}

export interface CatalogLesson {
  id: string;
  track: Track['id'];
  position: number;
  title: Record<Lang, string>;
}

export interface SortItem {
  id: string;
  text: string;
  bin: string;
  explain: string;
}

export interface Question {
  id: string;
  question: string;
  options: [string, string, string];
  answer: number;
  explain: string;
}

export interface LessonBody {
  id: string;
  version: number;
  language: Lang;
  title: string;
  intro: string[];
  game: {
    type: 'sort';
    prompt: string;
    practiceNotice?: string;
    bins: Array<{ id: string; label: string }>;
    items: SortItem[];
  };
  quiz: Question[];
  summary: string;
}

export const tracks = catalogJson.tracks as Track[];
export const catalogLessons = catalogJson.lessons as CatalogLesson[];

// Validated at build time by scripts/validate-content.ts; bundled with the app.
const bodies = import.meta.glob<LessonBody>('../../../../content/lessons/*/*.json', {
  eager: true,
  import: 'default',
});

export function lessonBody(id: string, lang: Lang): LessonBody | null {
  return bodies[`../../../../content/lessons/${lang}/${id}.json`] ?? null;
}

export function lessonsInTrack(track: Track['id']): CatalogLesson[] {
  return catalogLessons.filter((l) => l.track === track).sort((a, b) => a.position - b.position);
}

export type LessonState = 'open' | 'done' | 'soon' | 'locked_plan' | 'locked_age';

export function lessonState(
  lesson: CatalogLesson,
  ctx: { lang: Lang; plan: Plan; ageBand: AgeBand; completed: Set<string> },
): LessonState {
  const track = tracks.find((t) => t.id === lesson.track);
  if (track?.plan === 'family' && ctx.plan !== 'family') return 'locked_plan';
  if (track?.minAgeBand === '10-12' && ctx.ageBand !== '10-12') return 'locked_age';
  if (!lessonBody(lesson.id, ctx.lang)) return 'soon';
  return ctx.completed.has(lesson.id) ? 'done' : 'open';
}
