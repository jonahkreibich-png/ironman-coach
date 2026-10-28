/* Arten von Datensätzen, die zwischen App und Server synchronisiert werden. */
export const SYNC_KINDS = [
  'session', 'trend', 'nutrition', 'custom', 'illness', 'milestone', 'weekNote', 'settings', 'plan', 'adjust',
  // ab AUFTRAG-2/3
  'profile', 'goal', 'activity', 'coachMsg', 'coachNote', 'raceResult', 'meal',
  // Auftrag 7: Ergebnis des Analyse-Coachs (key „latest“)
  'analysis', 'strengthTemplate', 'workoutTemplate'
] as const;
export type SyncKind = typeof SYNC_KINDS[number];
