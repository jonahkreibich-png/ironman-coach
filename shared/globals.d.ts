// Lockere Typen für Object.values/entries: Datensätze aus Sync und Backup sind dynamisch.
interface ObjectConstructor {
  values(o: any): any[];
  entries(o: any): [string, any][];
}
