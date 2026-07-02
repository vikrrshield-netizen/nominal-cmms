import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

const DEVICE_MAX_FAILS = 6;
const DEVICE_WINDOW_MS = 5 * 60 * 1000;
const DEVICE_LOCK_MS = 5 * 60 * 1000;
const IP_MAX_FAILS = 40;
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_LOCK_MS = 15 * 60 * 1000;
// Globální strop napříč celým systémem — backstop proti hromadnému hádání PINu
// i při rotaci IP / podvrhávání deviceId (útočník obchází per-IP a per-device limit).
const GLOBAL_MAX_FAILS = 300;
const GLOBAL_WINDOW_MS = 15 * 60 * 1000;
const GLOBAL_LOCK_MS = 5 * 60 * 1000;
const GLOBAL_ATTEMPT_KEY = '__global__';
const PIN_RE = /^\d{4,6}$/; // LOGIN: snese i stávající 4místné PINy (jinak by se nikdo nepřihlásil)
const PIN_SET_RE = /^\d{6}$/; // NOVÉ / MĚNĚNÉ PINy: povinně 6 číslic (silnější, stávající nechává být)
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{16,80}$/;
const LEGACY_AUTH_EMAIL_RE = /^pin_\d{4,6}@nominal\.local$/i;
const SECRET_OPTS: functions.RuntimeOptions = { secrets: ['LOGIN_PEPPER'] };

const TOKEN_PERMISSION_ALLOWLIST = ['production.read', 'production.manage', 'report.read'];

const ROLE_ID_BY_ROLE: Record<string, string> = {
  SUPERADMIN: 'role_superadmin',
  VEDENI: 'role_vedeni',
  MAJITEL: 'role_majitel',
  UDRZBA: 'role_udzba',
  SKLADNIK: 'role_skladnik',
  VYROBA: 'role_vyroba',
  OPERATOR: 'role_operator',
};

const FALLBACK_TOKEN_PERMISSIONS: Record<string, string[]> = {
  MAJITEL: ['report.read'],
  VEDENI: ['production.manage', 'report.read'],
  SUPERADMIN: ['production.manage', 'report.read'],
  UDRZBA: ['production.manage', 'report.read'],
  VYROBA: ['production.manage', 'report.read'],
  SKLADNIK: ['report.read'],
  OPERATOR: ['production.read'],
};

type AttemptDoc = {
  fails?: number;
  lockedUntil?: admin.firestore.Timestamp;
  windowStartedAt?: admin.firestore.Timestamp;
};

function db() {
  return admin.firestore();
}

function legacyEnabled(): boolean {
  return (process.env.LEGACY_LOGIN_ENABLED ?? '0') !== '0';
}

function getPepper(): string {
  const pepper = process.env.LOGIN_PEPPER || '';
  if (!pepper) {
    throw new functions.https.HttpsError('failed-precondition', 'Chybi konfigurace LOGIN_PEPPER.');
  }
  return pepper;
}

function hashPin(pin: string): string {
  return crypto.createHmac('sha256', getPepper()).update(pin).digest('hex');
}

function randomPassword(): string {
  return crypto.randomBytes(24).toString('hex');
}

function stableAuthEmail(uid: string): string {
  return `u_${uid}@nominal.local`;
}

function temporaryAuthEmail(): string {
  return `worker_${Date.now()}_${crypto.randomBytes(4).toString('hex')}@nominal.local`;
}

function safeRole(value: unknown): string {
  const role = String(value || '').trim().toUpperCase();
  return ROLE_ID_BY_ROLE[role] ? role : 'OPERATOR';
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
}

async function computeTokenPermissions(userData: admin.firestore.DocumentData): Promise<string[]> {
  const role = String(userData.role || '');
  const roleIds = uniqueStrings(userData.roleIds);
  const granted = uniqueStrings(userData.customPermissions?.granted);
  const revoked = new Set(uniqueStrings(userData.customPermissions?.revoked));
  const permissions = new Set(FALLBACK_TOKEN_PERMISSIONS[role] || []);

  for (const roleId of roleIds) {
    const roleSnap = await db().doc(`roles/${roleId}`).get();
    const roleData = roleSnap.data() || {};
    if (roleData.isDeleted) continue;
    for (const permission of uniqueStrings(roleData.permissions)) {
      if (TOKEN_PERMISSION_ALLOWLIST.includes(permission)) permissions.add(permission);
    }
  }

  for (const permission of granted) {
    if (TOKEN_PERMISSION_ALLOWLIST.includes(permission)) permissions.add(permission);
  }
  for (const permission of revoked) {
    permissions.delete(permission);
  }

  return [...permissions].sort();
}

async function buildTokenClaims(userData: admin.firestore.DocumentData) {
  return {
    role: String(userData.role || 'OPERATOR'),
    permissions: await computeTokenPermissions(userData),
  };
}

async function assertAdmin(context: functions.https.CallableContext): Promise<void> {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Prihlaste se.');
  }
  const callerSnap = await db().doc(`users/${context.auth.uid}`).get();
  const caller = callerSnap.data() || {};
  const role = String(caller.role || '');
  const granted = uniqueStrings(caller.customPermissions?.granted);
  const isAdmin = role === 'SUPERADMIN' || role === 'VEDENI' || granted.includes('admin.manage');
  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Nemate opravneni k teto akci.');
  }
}

function ipAttemptKey(context: functions.https.CallableContext): string {
  const ip = context.rawRequest?.ip || context.instanceIdToken || 'unknown';
  return `ip_${crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 40)}`;
}

function deviceAttemptKey(deviceId: string): string {
  return `dev_${deviceId}`;
}

async function readAttempt(ref: admin.firestore.DocumentReference): Promise<AttemptDoc> {
  const snap = await ref.get();
  return snap.exists ? (snap.data() as AttemptDoc) : {};
}

function assertNotLocked(attempt: AttemptDoc, now: number): void {
  if (attempt.lockedUntil?.toMillis?.() && attempt.lockedUntil.toMillis() > now) {
    throw new functions.https.HttpsError('resource-exhausted', 'Prilis mnoho pokusu. Zkuste to za chvili.');
  }
}

async function recordFailedAttempt(
  ref: admin.firestore.DocumentReference,
  attempt: AttemptDoc,
  now: number,
  maxFails: number,
  windowMs: number,
  lockMs: number,
): Promise<void> {
  const windowStart = attempt.windowStartedAt?.toMillis?.() || now;
  const resetWindow = now - windowStart > windowMs;
  const fails = (resetWindow ? 0 : attempt.fails || 0) + 1;
  const update: admin.firestore.UpdateData<admin.firestore.DocumentData> = {
    fails,
    lastFailAt: admin.firestore.Timestamp.fromMillis(now),
    windowStartedAt: admin.firestore.Timestamp.fromMillis(resetWindow ? now : windowStart),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (fails >= maxFails) {
    update.lockedUntil = admin.firestore.Timestamp.fromMillis(now + lockMs);
    update.fails = 0;
    update.windowStartedAt = admin.firestore.Timestamp.fromMillis(now);
  }
  await ref.set(update, { merge: true });
}

async function clearLoginAttempts(): Promise<number> {
  let deleted = 0;
  while (true) {
    const snap = await db().collection('login_attempts').limit(450).get();
    if (snap.empty) break;
    const batch = db().batch();
    for (const docSnap of snap.docs) batch.delete(docSnap.ref);
    await batch.commit();
    deleted += snap.size;
    if (snap.size < 450) break;
  }
  return deleted;
}

export const loginWithPin = functions
  .runWith(SECRET_OPTS)
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    const pin = String(data?.pin || '').trim();
    if (!PIN_RE.test(pin)) {
      throw new functions.https.HttpsError('invalid-argument', 'Neplatny PIN.');
    }
    const rawDeviceId = String(data?.deviceId || '').trim();
    const deviceId = DEVICE_ID_RE.test(rawDeviceId) ? rawDeviceId : '';

    const now = Date.now();
    const ipAttemptRef = db().doc(`login_attempts/${ipAttemptKey(context)}`);
    const deviceAttemptRef = deviceId ? db().doc(`login_attempts/${deviceAttemptKey(deviceId)}`) : null;
    const globalAttemptRef = db().doc(`login_attempts/${GLOBAL_ATTEMPT_KEY}`);
    const ipAttempt = await readAttempt(ipAttemptRef);
    const deviceAttempt = deviceAttemptRef ? await readAttempt(deviceAttemptRef) : {};
    const globalAttempt = await readAttempt(globalAttemptRef);

    assertNotLocked(ipAttempt, now);
    assertNotLocked(deviceAttempt, now);
    assertNotLocked(globalAttempt, now); // hromadné hádání zablokuje login krátce pro všechny

    const pinHash = hashPin(pin);
    const secretSnap = await db().collection('user_secrets').where('pinHash', '==', pinHash).limit(1).get();
    let userId = secretSnap.empty ? '' : secretSnap.docs[0].id;
    let userData: admin.firestore.DocumentData | null = null;

    if (userId) {
      const userSnap = await db().doc(`users/${userId}`).get();
      userData = userSnap.data() || null;
      const active = !!userData && userData.active !== false && userData.isActive !== false;
      if (!active) userId = '';
    }

    if (!userId) {
      const fails: Promise<void>[] = [
        recordFailedAttempt(ipAttemptRef, ipAttempt, now, IP_MAX_FAILS, IP_WINDOW_MS, IP_LOCK_MS),
        recordFailedAttempt(globalAttemptRef, globalAttempt, now, GLOBAL_MAX_FAILS, GLOBAL_WINDOW_MS, GLOBAL_LOCK_MS),
      ];
      if (deviceAttemptRef) {
        fails.push(recordFailedAttempt(deviceAttemptRef, deviceAttempt, now, DEVICE_MAX_FAILS, DEVICE_WINDOW_MS, DEVICE_LOCK_MS));
      }
      await Promise.all(fails);
      throw new functions.https.HttpsError('unauthenticated', 'Nespravny PIN.');
    }

    if (deviceAttemptRef) await deviceAttemptRef.delete().catch(() => undefined);
    await db().doc(`users/${userId}`).set(
      { lastLoginAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );

    const token = await admin.auth().createCustomToken(userId, await buildTokenClaims(userData || {}));
    return { token };
  });

export const adminSetUserPin = functions
  .runWith(SECRET_OPTS)
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    await assertAdmin(context);

    const userId = String(data?.userId || '').trim();
    const pin = String(data?.pin || '').trim();
    if (!userId) throw new functions.https.HttpsError('invalid-argument', 'Chybi userId.');
    if (!PIN_SET_RE.test(pin)) throw new functions.https.HttpsError('invalid-argument', 'PIN musi mit 6 cislic.');

    const pinHash = hashPin(pin);
    const dup = await db().collection('user_secrets').where('pinHash', '==', pinHash).limit(1).get();
    if (!dup.empty && dup.docs[0].id !== userId) {
      throw new functions.https.HttpsError('already-exists', 'Tento PIN uz pouziva jiny uzivatel.');
    }

    await db().doc(`user_secrets/${userId}`).set(
      {
        pinHash,
        pinLength: pin.length,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: context.auth?.uid || '',
      },
      { merge: true },
    );

    await admin.auth().updateUser(userId, { password: randomPassword() }).catch(() => undefined);
    await db().doc(`users/${userId}`).set(
      {
        pin: admin.firestore.FieldValue.delete(),
        pinLength: pin.length,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    const clearedAttempts = await clearLoginAttempts();
    return { ok: true, clearedAttempts, legacyEnabled: legacyEnabled() };
  });

export const adminCreateUser = functions
  .runWith(SECRET_OPTS)
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    await assertAdmin(context);

    const displayName = String(data?.displayName || '').trim();
    const pin = String(data?.pin || '').trim();
    const role = safeRole(data?.role);
    if (!displayName) throw new functions.https.HttpsError('invalid-argument', 'Chybi jmeno.');
    if (!PIN_SET_RE.test(pin)) throw new functions.https.HttpsError('invalid-argument', 'PIN musi mit 6 cislic.');

    const pinHash = hashPin(pin);
    const dup = await db().collection('user_secrets').where('pinHash', '==', pinHash).limit(1).get();
    if (!dup.empty) {
      throw new functions.https.HttpsError('already-exists', 'Tento PIN uz pouziva jiny uzivatel.');
    }

    const authUser = await admin.auth().createUser({
      email: temporaryAuthEmail(),
      password: randomPassword(),
      displayName,
      disabled: false,
    });
    const uid = authUser.uid;
    const email = stableAuthEmail(uid);
    const roleId = ROLE_ID_BY_ROLE[role] || ROLE_ID_BY_ROLE.OPERATOR;
    const now = admin.firestore.FieldValue.serverTimestamp();

    try {
      await admin.auth().updateUser(uid, { email });
      await db().doc(`user_secrets/${uid}`).set({
        pinHash,
        pinLength: pin.length,
        updatedAt: now,
        updatedBy: context.auth?.uid || '',
      });
      await db().doc(`users/${uid}`).set({
        id: uid,
        uid,
        displayName,
        role,
        roleIds: [roleId],
        primaryRoleId: roleId,
        email,
        phone: String(data?.phone || data?.email || '').trim(),
        buildingId: String(data?.building || '').trim(),
        positionId: String(data?.positionId || '').trim(),
        color: '#64748b',
        active: true,
        isActive: true,
        tenantId: String(data?.tenantId || 'main_firm').trim() || 'main_firm',
        customPermissions: { granted: [], revoked: [] },
        scope: { buildings: ['*'], areas: ['*'] },
        pinLength: pin.length,
        createdAt: now,
        updatedAt: now,
        updatedBy: context.auth?.uid || '',
      });
    } catch (err) {
      await admin.auth().deleteUser(uid).catch(() => undefined);
      await db().doc(`user_secrets/${uid}`).delete().catch(() => undefined);
      throw err;
    }

    const clearedAttempts = await clearLoginAttempts();
    return { uid, email, clearedAttempts };
  });

// Aktivace / DEAKTIVACE uživatele — deaktivace teď opravdu vyřadí přístup:
// vypne Auth účet (disabled:true) a zneplatní obnovovací tokeny, takže i otevřená
// session propadne (ID token nejde obnovit). Bez toho byl active:false bezzubý.
export const adminSetUserActive = functions
  .runWith(SECRET_OPTS)
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    await assertAdmin(context);
    const userId = String(data?.userId || '').trim();
    const active = data?.active !== false; // default true, false = deaktivace
    if (!userId) throw new functions.https.HttpsError('invalid-argument', 'Chybi userId.');
    if (userId === context.auth?.uid && !active) {
      throw new functions.https.HttpsError('failed-precondition', 'Nemuzes deaktivovat sam sebe.');
    }

    await db().doc(`users/${userId}`).set(
      {
        active,
        isActive: active,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: context.auth?.uid || '',
      },
      { merge: true },
    );

    await admin.auth().updateUser(userId, { disabled: !active }).catch(() => undefined);
    if (!active) {
      await admin.auth().revokeRefreshTokens(userId).catch(() => undefined);
    }

    return { ok: true, active };
  });

// Úprava existujícího uživatele (přes Admin SDK — klientský update role/scope/kioskButtons rules odmítají).
// Základní pole smí kterýkoli admin; role/práva/scope jen SUPERADMIN/admin.manage (proti self-escalaci).
export const adminUpdateUser = functions
  .runWith(SECRET_OPTS)
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    await assertAdmin(context);
    const userId = String(data?.userId || '').trim();
    if (!userId) throw new functions.https.HttpsError('invalid-argument', 'Chybi userId.');
    const u = (data?.updates && typeof data.updates === 'object') ? data.updates : {};

    const callerSnap = await db().doc(`users/${context.auth!.uid}`).get();
    const callerData = callerSnap.data() || {};
    const canManageRoles = String(callerData.role || '') === 'SUPERADMIN'
      || uniqueStrings(callerData.customPermissions?.granted).includes('admin.manage');

    const out: admin.firestore.UpdateData<admin.firestore.DocumentData> = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: context.auth?.uid || '',
    };
    for (const k of ['displayName', 'phone', 'email', 'buildingId', 'color', 'positionId', 'nickname', 'kioskButtons', 'workwear', 'workwearSizes']) {
      if (k in u) out[k] = u[k];
    }
    if (canManageRoles) {
      if ('role' in u) {
        const role = safeRole(u.role);
        const roleId = ROLE_ID_BY_ROLE[role] || ROLE_ID_BY_ROLE.OPERATOR;
        out.role = role;
        out.roleIds = [roleId];
        out.primaryRoleId = roleId;
      }
      if ('customPermissions' in u) out.customPermissions = u.customPermissions;
      if ('scope' in u) out.scope = u.scope;
    }

    await db().doc(`users/${userId}`).set(out, { merge: true });

    // Sladit token claims (role/práva) — projeví se po dalším loginu/refreshi.
    if (canManageRoles && ('role' in u || 'customPermissions' in u)) {
      try {
        const fresh = (await db().doc(`users/${userId}`).get()).data() || {};
        await admin.auth().setCustomUserClaims(userId, await buildTokenClaims(fresh));
      } catch (err) {
        console.warn('[adminUpdateUser] setCustomUserClaims failed', err);
      }
    }
    return { ok: true, sensitiveApplied: canManageRoles };
  });

export const backfillPinHashes = functions
  .runWith(SECRET_OPTS)
  .https.onCall(async (_data: any, context: functions.https.CallableContext) => {
    await assertAdmin(context);

    const usersSnap = await db().collection('users').get();
    let updated = 0;
    let skipped = 0;

    for (const docSnap of usersSnap.docs) {
      const userData = docSnap.data();
      const pin = String(userData.pin || '').trim();
      if (!PIN_RE.test(pin)) { skipped++; continue; }
      const pinHash = hashPin(pin);
      await db().doc(`user_secrets/${docSnap.id}`).set(
        {
          pinHash,
          pinLength: pin.length,
          backfilledAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await db().doc(`users/${docSnap.id}`).set(
        {
          pin: admin.firestore.FieldValue.delete(),
          pinLength: pin.length,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      updated++;
    }

    return { updated, skipped };
  });

export const deletePlaintextPins = functions
  .runWith(SECRET_OPTS)
  .https.onCall(async (_data: any, context: functions.https.CallableContext) => {
    await assertAdmin(context);
    const usersSnap = await db().collection('users').get();
    let deleted = 0;
    let skipped = 0;
    const batchLimit = 400;
    let batch = db().batch();
    let pending = 0;

    const commitBatch = async () => {
      if (pending === 0) return;
      await batch.commit();
      batch = db().batch();
      pending = 0;
    };

    for (const docSnap of usersSnap.docs) {
      if (!Object.prototype.hasOwnProperty.call(docSnap.data(), 'pin')) {
        skipped++;
        continue;
      }
      batch.set(docSnap.ref, {
        pin: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      deleted++;
      pending++;
      if (pending >= batchLimit) await commitBatch();
    }

    await commitBatch();
    return { deleted, skipped };
  });

export const disableLegacyLogin = functions
  .runWith(SECRET_OPTS)
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    await assertAdmin(context);
    if (data?.confirm !== 'ANO') {
      throw new functions.https.HttpsError('failed-precondition', 'Potvrdte predanim confirm="ANO".');
    }

    const usersSnap = await db().collection('users').get();
    let processed = 0;
    let missingSecret = 0;

    for (const docSnap of usersSnap.docs) {
      const secret = await db().doc(`user_secrets/${docSnap.id}`).get();
      if (!secret.exists) { missingSecret++; continue; }
      const authUpdate: admin.auth.UpdateRequest = { password: randomPassword() };
      const authUser = await admin.auth().getUser(docSnap.id).catch(() => null);
      if (authUser?.email && LEGACY_AUTH_EMAIL_RE.test(authUser.email)) {
        authUpdate.email = stableAuthEmail(docSnap.id);
      }
      await admin.auth().updateUser(docSnap.id, authUpdate).catch(() => undefined);
      await db().doc(`users/${docSnap.id}`).set(
        {
          email: authUpdate.email || docSnap.data().email,
          pin: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      processed++;
    }

    return { processed, missingSecret, note: 'LEGACY_LOGIN_ENABLED musi byt 0 pred deployem funkci.' };
  });

export const migrateAuthEmails = functions
  .runWith(SECRET_OPTS)
  .https.onCall(async (_data: any, context: functions.https.CallableContext) => {
    await assertAdmin(context);

    let authMigrated = 0;
    let authAlreadyClean = 0;
    let authFailures = 0;
    let nextPageToken: string | undefined;

    do {
      const page = await admin.auth().listUsers(1000, nextPageToken);
      nextPageToken = page.pageToken;

      for (const userRecord of page.users) {
        const currentEmail = userRecord.email || '';
        const targetEmail = stableAuthEmail(userRecord.uid);
        if (currentEmail === targetEmail || !LEGACY_AUTH_EMAIL_RE.test(currentEmail)) {
          authAlreadyClean++;
          continue;
        }
        try {
          await admin.auth().updateUser(userRecord.uid, {
            email: targetEmail,
            password: randomPassword(),
          });
          authMigrated++;
        } catch (err) {
          console.error('[migrateAuthEmails] auth update failed', userRecord.uid, err);
          authFailures++;
        }
      }
    } while (nextPageToken);

    const usersSnap = await db().collection('users').get();
    let firestoreUpdated = 0;
    const batchLimit = 400;
    let batch = db().batch();
    let pending = 0;

    const commitBatch = async () => {
      if (pending === 0) return;
      await batch.commit();
      batch = db().batch();
      pending = 0;
    };

    for (const docSnap of usersSnap.docs) {
      const userData = docSnap.data();
      const update: admin.firestore.UpdateData<admin.firestore.DocumentData> = {
        pin: admin.firestore.FieldValue.delete(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (LEGACY_AUTH_EMAIL_RE.test(String(userData.email || ''))) {
        update.email = stableAuthEmail(docSnap.id);
      }
      batch.set(docSnap.ref, update, { merge: true });
      pending++;
      firestoreUpdated++;
      if (pending >= batchLimit) await commitBatch();
    }
    await commitBatch();

    return { authMigrated, authAlreadyClean, authFailures, firestoreUpdated };
  });
