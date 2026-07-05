// PowerGym now uses MySQL-backed API endpoints.
// This file keeps the previous Firebase-style imports working without bundling
// the Firebase SDK in the browser build.
import { collection, addDoc, serverTimestamp, getFirestore } from 'firebase/firestore';

export const firebaseConfig = { projectId: "powergym-mysql", appId: "powergym-mysql" };
export const db = getFirestore();

// Mock storage to prevent build errors in modules that still import storage.
export const storage = {} as any;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export async function logAuditAction(action: string, targetId: string, details: string) {
  try {
    const rawAuth = localStorage.getItem('auth_user');
    const uid = rawAuth ? JSON.parse(rawAuth).uid : 'system';

    await addDoc(collection(db, 'auditLogs'), {
      action,
      performedBy: uid,
      targetId,
      details,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Failed to log audit action:', error);
  }
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const rawAuth = localStorage.getItem('auth_user');
  const uid = rawAuth ? JSON.parse(rawAuth).uid : 'system';

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: uid,
    },
    operationType,
    path,
  };
  console.error('Firestore compatibility error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
