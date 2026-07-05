// Simple in-memory / REST simulation of Firestore for MySQL migration

export function getFirestore() {
  return { isMockDB: true };
}

export function collection(db: any, path: string) {
  return { path, isCollection: true };
}

export function doc(db: any, pathOrId: string, id?: string) {
  if (typeof db === 'string' && !id) {
    // Some uses might be doc('collection/id')
    const parts = db.split('/');
    return { path: parts[0], id: parts[1], isDoc: true };
  }
  let path = pathOrId;
  let docId = id;
  
  if (db?.isCollection) {
    path = db.path;
    docId = pathOrId;
  }
  return { path, id: docId, isDoc: true };
}

export function query(collectionRef: any, ...constraints: any[]) {
  return { ...collectionRef, constraints };
}

export function where(field: string, op: string, value: any) {
  return { type: 'where', field, op, value };
}

export function orderBy(field: string, direction = 'asc') {
  return { type: 'orderBy', field, direction };
}

export function limit(n: number) {
  return { type: 'limit', value: n };
}

export function serverTimestamp() {
  return new Date().toISOString();
}

// Data format helper
function parseData(data: any) {
  if (!data) return {};
  if (typeof data === 'object') return data;
  try {
    return JSON.parse(String(data));
  } catch {
    return {};
  }
}

function wrapDoc(docData: any) {
  const dataPayload = { ...parseData(docData.data), ...docData };
  return {
    id: docData.id,
    ref: { path: docData.path, id: docData.id, isDoc: true },
    data: () => dataPayload,
    exists: () => true
  };
}

async function checkedJson(res: Response) {
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const message = payload?.error?.message || payload?.error || `Database request failed with ${res.status}`;
    throw new Error(message);
  }
  return payload;
}

export async function getDocs(queryRef: any) {
  const collectionName = queryRef.path;
  const res = await fetch(`/api/records/${collectionName}`, { credentials: 'include' });
  let rows = await checkedJson(res);
  if (!Array.isArray(rows)) rows = [];

  // Very basic in-memory filtering based on constraints if any
  if (queryRef.constraints) {
    for (const c of queryRef.constraints) {
      if (c.type === 'where') {
        const field = c.field;
        rows = rows.filter((r: any) => {
          let v = r[field];
          if (r.data) {
             const parsed = parseData(r.data);
             if (parsed[field] !== undefined) v = parsed[field];
          }
          if (c.op === '==') return v == c.value;
          if (c.op === 'in') return Array.isArray(c.value) && c.value.includes(v);
          if (c.op === 'array-contains') return Array.isArray(v) && v.includes(c.value);
          return true;
        });
      } else if (c.type === 'orderBy') {
         rows.sort((a: any, b: any) => {
             const key = c.field;
             const valA = a[key] || (a.data ? parseData(a.data)[key] : null);
             const valB = b[key] || (b.data ? parseData(b.data)[key] : null);
             if (valA < valB) return c.direction === 'asc' ? -1 : 1;
             if (valA > valB) return c.direction === 'asc' ? 1 : -1;
             return 0;
         });
      }
    }
    // Handle limit constraint implicitly mostly
    const limitC = queryRef.constraints.find((c:any) => c.type === 'limit');
    if (limitC) {
      rows = rows.slice(0, limitC.value);
    }
  }

  const docs = rows.map((row: any) => wrapDoc({ ...row, path: collectionName }));
  return {
    docs,
    forEach: (cb: any) => docs.forEach(cb),
    size: rows.length,
    empty: rows.length === 0
  };
}

export async function getDoc(docRef: any) {
  const res = await fetch(`/api/records/${docRef.path}`, { credentials: 'include' });
  const rows = await checkedJson(res);
  if (Array.isArray(rows)) {
    const row = rows.find((r: any) => r.id === docRef.id);
    if (row) return wrapDoc({ ...row, path: docRef.path });
  }
  return { exists: () => false, data: () => null };
}

export async function addDoc(collectionRef: any, data: any) {
  const res = await fetch(`/api/records/${collectionRef.path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const row = await checkedJson(res);
  return wrapDoc({ ...row, path: collectionRef.path });
}

export async function setDoc(docRef: any, data: any, options?: any) {
  const method = 'PUT'; // Using PUT as upsert essentially
  const res = await fetch(`/api/records/${docRef.path}/${docRef.id}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  await checkedJson(res);
}

export async function updateDoc(docRef: any, data: any) {
  const res = await fetch(`/api/records/${docRef.path}/${docRef.id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  await checkedJson(res);
}

export async function deleteDoc(docRef: any) {
  const res = await fetch(`/api/records/${docRef.path}/${docRef.id}`, {
    method: 'DELETE',
    credentials: 'include'
  });
  await checkedJson(res);
}

// Basic mock for onSnapshot - just fetches once
export function onSnapshot(ref: any, callback: (doc: any) => void) {
  if (ref.isDoc) {
    getDoc(ref).then(callback);
  } else {
    getDocs(ref).then(callback);
  }
  return () => { /* unsubscribe */ };
}
