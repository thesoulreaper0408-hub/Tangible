import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * The Tangible collection.
 *
 * To add a new model:
 *   1. Build it as a full-screen React component in `src/models/`.
 *   2. Append an entry below. It appears on the landing page automatically
 *      and gets its own URL at `/models/<slug>`.
 */
export interface ModelEntry {
  slug: string;
  name: string;
  /** One-line hook shown in the index. */
  tagline: string;
  /** Short paragraph shown in the expanded preview. */
  description: string;
  /** What everyday thing this is a model of. */
  subject: string;
  tags: string[];
  /** Accent colour used for this entry's hover state and preview swatch. */
  accent: string;
  /** Secondary colour for the preview swatch gradient. */
  accentDeep: string;
  addedOn: string;
  component: LazyExoticComponent<ComponentType>;
}

export const MODELS: ModelEntry[] = [
  {
    slug: 'hydrogen-pool',
    name: 'Hydrogen Pool',
    tagline: 'A backyard swimming pool you can splash, stir and make it rain on.',
    description:
      'Real-time wave physics, light caustics dancing on the tiles, floating toys that bob in your wake, and a soundscape that follows the water. Change the time of day, retile the floor, switch on the LEDs.',
    subject: 'Swimming pool',
    tags: ['Water', 'Physics', 'Sound'],
    accent: '#5eead4',
    accentDeep: '#0e7490',
    addedOn: '2026-11',
    component: lazy(() => import('./PoolExperience')),
  },
];

export function findModel(slug: string) {
  return MODELS.find((m) => m.slug === slug);
}
