const DB = 'usb-ai-web-v1';
let connection;
export function openDB() {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const name of ['chats', 'documents', 'models', 'settings', 'memory']) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return connection;
}
export async function all(store) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function get(store, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function put(store, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readwrite').objectStore(store).put(value);
    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });
}
export async function remove(store, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readwrite').objectStore(store).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Delete conversations and their documents in one transaction.
export async function removeChats(ids) {
  const db = await openDB();
  const selected = new Set(ids);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['chats', 'documents'], 'readwrite');
    const chats = tx.objectStore('chats'), docs = tx.objectStore('documents');
    for (const id of selected) chats.delete(id);
    const cursor = docs.openCursor();
    cursor.onsuccess = () => { const item = cursor.result; if (!item) return; if (selected.has(item.value.chatId)) item.delete(); item.continue(); };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}
