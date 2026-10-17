export async function database() {
  return new Promise<IDBDatabase>((ok, no) => {
    const r = indexedDB.open("zifang", 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore("projects", { keyPath: "id" });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}
export async function saveProject(p: Record<string, unknown>) {
  const db = await database();
  return new Promise<void>((ok, no) => {
    const t = db.transaction("projects", "readwrite");
    t.objectStore("projects").put(p);
    t.oncomplete = () => {
      db.close();
      ok();
    };
    t.onerror = () => {
      db.close();
      no(t.error);
    };
  });
}
export async function listProjects() {
  const db = await database();
  return new Promise<any[]>((ok, no) => {
    const r = db.transaction("projects").objectStore("projects").getAll();
    r.onsuccess = () => {
      db.close();
      ok(r.result);
    };
    r.onerror = () => {
      db.close();
      no(r.error);
    };
  });
}
