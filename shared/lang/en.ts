/* Englische Texte (vorbereitet). Fehlende Schlüssel fallen auf Deutsch zurück. Vollständig übersetzen: siehe SPAETER.md. */
export const en: Record<string, string> = {
  'tab.heute': 'Today', 'tab.plan': 'Plan', 'tab.coach': 'Coach', 'tab.fortschritt': 'Progress', 'tab.mehr': 'More',
  'common.back': 'Back', 'common.close': 'Close', 'common.save': 'Save', 'common.saved': 'Saved', 'common.delete': 'Delete',
  'common.next': 'Next', 'common.yes': 'Yes', 'common.no': 'No', 'common.loading': 'Loading …', 'common.today': 'today',
  'sport.swim': 'Swim', 'sport.bike': 'Bike', 'sport.run': 'Run', 'sport.strength': 'Strength', 'sport.football': 'Team sport', 'sport.rest': 'Rest',
  'dow.0': 'Sun', 'dow.1': 'Mon', 'dow.2': 'Tue', 'dow.3': 'Wed', 'dow.4': 'Thu', 'dow.5': 'Fri', 'dow.6': 'Sat',
  'heute.st.ready': 'Ready', 'heute.st.easy': 'Easy', 'heute.st.rest': 'Rest', 'heute.st.novalues': 'Uncertain',
  'heute.line.green': '{s}/100: train as planned. All good.', 'heute.line.yellow': '{s}/100: train easier, no intensity.', 'heute.line.red': '{s}/100: rest or very easy only.',
  'heute.unsureNone': 'Uncertain – no morning values. Enter sleep and resting HR or connect a watch or ring.', 'heute.unsureFew': 'Uncertain – only {v} today. Add sleep and resting HR or HRV.', 'heute.unsureStale': 'Based on the last values it was {c}.',
  'heute.c.green': 'green', 'heute.c.yellow': 'yellow', 'heute.c.red': 'red', 'heute.c.none': 'missing or still learning', 'heute.critMissing': 'missing today',
  'v.feelMorning': 'How do you feel?', 'v.soreness': 'Muscle soreness', 'v.feel1': 'very fresh', 'v.feel2': 'fresh', 'v.feel3': 'normal', 'v.feel4': 'tired', 'v.feel5': 'very tired', 'v.sore0': 'none', 'v.sore1': 'light', 'v.sore2': 'clear', 'v.sore3': 'strong',
  'sess.drills': 'Drills explained', 'cons.swimGear': 'Swim equipment', 'cons.swimGearHint': 'Only this equipment is used in your swim sessions.', 'cons.swimGearNone': 'Not set yet: your sessions use no equipment. Tap what you have.',
  'fb.st.verworfen': 'discarded', 'fb.toWork': 'In progress', 'fb.discard': 'Discard', 'fb.doneList': 'Done ({n})', 'fb.openCount': '{n} open, {neu} new', 'fb.swipeHint': 'Swipe left: done, right: in progress', 'fb.statusSet': 'Status: {s}', 'fb.opTitle': 'Notes for you as operator', 'fb.errTimes': '{n}×', 'fb.errWho': 'for {u}',
  'conn.appfolderAdminTitle': 'Operator: Dropbox app has App-folder access only', 'conn.appfolderAdmin': 'It cannot see /Apps/HealthFit. Create a new Dropbox app with Full Dropbox, set DROPBOX_APP_KEY and DROPBOX_APP_SECRET again, then reconnect here.', 'conn.appfolderUser': 'Dropbox is not fully set up on the server yet. The operator is on it, nothing to do for you. Then reconnect once.',
  'conn.dbxStale': 'Last file from HealthFit: {d}. Nothing new? In HealthFit: Settings → Automatic export → Dropbox on, format FIT, and open HealthFit once after training.', 'conn.dbxFit': 'FIT files in your Dropbox:', 'conn.newest': 'newest', 'conn.dbxSwitched': 'switched to {f}',
  'v.feel': 'Feeling', 'v.load': 'Load', 'v.ill': 'Illness', 'heute.restDay': 'Rest day',
  'heute.goalIn': '{name} in {n} days', 'heute.week': 'This week', 'heute.values': 'Metrics',
  'sub.werte': 'Metrics', 'sub.essen': 'Nutrition', 'sub.profil': 'Profile and goals', 'sub.verbindungen': 'Connections',
  'sub.einstellungen': 'Settings', 'sub.daten': 'Data and devices', 'sub.wettkampf': 'Race', 'sub.onboarding': 'Questionnaire'
};
