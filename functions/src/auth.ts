// functions/src/auth.ts
// VIKRSHIELD — bezpečné přihlášení PINem přes custom token.
//
// Princip:
//  - PIN se NIKDY nepřevádí na heslo. Klient pošle PIN -> funkce ověří
//    proti pinHash uloženému v user_secrets/{uid} -> vrátí custom token.
//  - pinHash = HMAC-SHA256(LOGIN_PEPPER, pin). PEPPER je secret jen na serveru,
//    takže únik databáze sám o sobě PIN neprozradí.
//  - Lockout: počítadlo pokusů v login_attempts -> po MAX_FAILS blok na LOCK_MS.
//  - PIN je variabilní 4–6 číslic.
//
// LEGACY_LOGIN_ENABLED='1' (default) = přechodové období: adminSetUserPin
// zároveň drží i starou cestu (heslo pin+'00'), aby šlo nasazovat po fázích.
// Po F3 (disableLegacyLogin) se nastaví na '0' a stará cesta zmrtví.

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

const MAX_FAILS = 5;            // počet špatných pokusů před zámkem
const LOCK_MS = 5 * 60 * 1000;  // doba zámku (5 min)
const PIN_RE = /^\d{4,6}$/;

const SECRET_OPTS: functions.RuntimeOptions = { secrets: ['LOGIN_PEPPER'] };

function db() {
  return admin.firestore();
}

function legacyEnabled(): boolean {
  return (process.env.LEGACY_LOGIN_ENABLED ?? '1') !== '0';
}

function getPepper(): string {
  const pepper = process.env.LOGIN_PEPPER || '';
  if (!pepper) {
    throw new functions.https.HttpsError('failed-precondition', 'Chybí konfigurace LOGIN_PEPPER.');
  }
  return pepper;
}

function hashPin(pin: string): string {
  return crypto.createHmac('sha256', getPepper()).update(pin).digest('hex');
}

function legacyPassword(pin: string): string {
  return pin + '00';
}

function randomPassword(): string {
  return crypto.randomBytes(24).toString('hex');
}

async function assertAdmin(context: functions.https.CallableContext): Promise<void> {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Přihlaste se.');
  }
  const callerSnap = await db().doc(`users/${context.auth.uid}`).get();
  const caller: any = callerSnap.data() || {};
  const role = String(caller.role || '');
  const granted: string[] = Array.isArray(caller.customPermissions?.granted)
    ? caller.customPermissions.granted
    : [];
  const isAdmin = role === 'SUPERADMIN' || role === 'VEDENI' || granted.includes('admin.manage');
  if (!isAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Nemáte oprávnění k této akci.');
  }
}

function attemptKey(context: functions.https.CallableContext): string {
  const ip = context.rawRequest?.ip || context.instanceIdToken || 'unknown';
  return crypto.createHash('sha256').update(String(ip)).digest('hex').slice(0, 40);
}

// ─────────────────────────────────────────────────────────────
// loginWithPin — veřejné přihlášení PINem -> custom token
// ─────────────────────────────────────────────────────────────
export const loginWithPin = functions
  .runWith(SECRET_OPTS)
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    const pin = String(data?.pin || '').trim();
    if (!PIN_RE.test(pin)) {
      throw new functions.https.HttpsError('invalid-argument', 'Neplatný PIN.');
    }

    const now = Date.now();
    const attemptRef = db().doc(`login_attempts/${attemptKey(context)}`);
    const attemptSnap = await attemptRef.get();
    const attempt = attemptSnap.exists ? (attemptSnap.data() as any) : null;

    if (attempt?.lockedUntil && attempt.lockedUntil.toMillis?.() > now) {
      throw new functions.https.HttpsError('resource-exhausted', 'Příliš mnoho pokusů. Zkuste to za chvíli.');
    }

    const pinHash = hashPin(pin);
    const secretSnap = await db().collection('user_secrets').where('pinHash', '==', pinHash).limit(1).get();
    let userId = secretSnap.empty ? '' : secretSnap.docs[0].id;

    // ověřit, že uživatel existuje a je aktivní
    let active = false;
    if (userId) {
      const userSnap = await db().doc(`users/${userId}`).get();
      const u = userSnap.data();
      active = !!u && u.active !== false && u.isActive !== false;
      if (!active) userId = '';
    }

    if (!userId) {
      const fails = (attempt?.fails || 0) + 1;
      const update: any = {
        fails,
        lastFailAt: admin.firestore.Timestamp.fromMillis(now),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (fails >= MAX_FAILS) {
        update.lockedUntil = admin.firestore.Timestamp.fromMillis(now + LOCK_MS);
        update.fails = 0;
      }
      await attemptRef.set(update, { merge: true });
      throw new functions.https.HttpsError('unauthenticated', 'Nesprávný PIN.');
    }

    // úspěch -> vynulovat pokusy + zapsat lastLogin
    if (attemptSnap.exists) {
      await attemptRef.delete().catch(() => undefined);
    }
    await db().doc(`users/${userId}`).set(
      { lastLoginAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );

    const token = await admin.auth().createCustomToken(userId);
    return { token };
  });

// ─────────────────────────────────────────────────────────────
// adminSetUserPin — admin nastaví/změní PIN uživatele (server-side hash)
// ─────────────────────────────────────────────────────────────
export const adminSetUserPin = functions
  .runWith(SECRET_OPTS)
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    await assertAdmin(context);

    const userId = String(data?.userId || '').trim();
    const pin = String(data?.pin || '').trim();
    if (!userId) throw new functions.https.HttpsError('invalid-argument', 'Chybí userId.');
    if (!PIN_RE.test(pin)) throw new functions.https.HttpsError('invalid-argument', 'PIN musí mít 4 až 6 číslic.');

    const pinHash = hashPin(pin);

    // unikátnost PINu napříč uživateli
    const dup = await db().collection('user_secrets').where('pinHash', '==', pinHash).limit(1).get();
    if (!dup.empty && dup.docs[0].id !== userId) {
      throw new functions.https.HttpsError('already-exists', 'Tento PIN už používá jiný uživatel.');
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

    if (legacyEnabled()) {
      // přechodové období: drž i starou cestu (heslo pin+'00')
      await admin.auth().updateUser(userId, { password: legacyPassword(pin) }).catch(() => undefined);
      await db().doc(`users/${userId}`).set({ pinLength: pin.length }, { merge: true });
    } else {
      // ostrý režim: náhodné heslo + smazat plaintext PIN
      await admin.auth().updateUser(userId, { password: randomPassword() }).catch(() => undefined);
      await db().doc(`users/${userId}`).set(
        { pin: admin.firestore.FieldValue.delete(), pinLength: pin.length },
        { merge: true },
      );
    }

    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────
// backfillPinHashes (F1) — doplní pinHash všem ze stávajícího plaintext pin.
// Nemaže nic, nereaguje na hesla -> stará cesta dál funguje.
// ─────────────────────────────────────────────────────────────
export const backfillPinHashes = functions
  .runWith(SECRET_OPTS)
  .https.onCall(async (_data: any, context: functions.https.CallableContext) => {
    await assertAdmin(context);

    const usersSnap = await db().collection('users').get();
    let updated = 0;
    let skipped = 0;

    for (const docSnap of usersSnap.docs) {
      const u = docSnap.data();
      const pin = String(u.pin || '').trim();
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
      await db().doc(`users/${docSnap.id}`).set({ pinLength: pin.length }, { merge: true });
      updated++;
    }

    return { updated, skipped };
  });

// ─────────────────────────────────────────────────────────────
// disableLegacyLogin (F3 — NEVRATNÉ) — náhodné heslo všem + smazání plaintext PIN.
// Spustit AŽ po ověření, že přihlášení přes custom token funguje.
// Po této akci nastav LEGACY_LOGIN_ENABLED='0'.
// ─────────────────────────────────────────────────────────────
export const disableLegacyLogin = functions
  .runWith(SECRET_OPTS)
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    await assertAdmin(context);
    if (data?.confirm !== 'ANO') {
      throw new functions.https.HttpsError('failed-precondition', 'Potvrďte předáním confirm="ANO".');
    }

    const usersSnap = await db().collection('users').get();
    let processed = 0;
    let missingSecret = 0;

    for (const docSnap of usersSnap.docs) {
      const secret = await db().doc(`user_secrets/${docSnap.id}`).get();
      if (!secret.exists) { missingSecret++; continue; } // nemigrovaný účet přeskoč (nezamykat)
      await admin.auth().updateUser(docSnap.id, { password: randomPassword() }).catch(() => undefined);
      await db().doc(`users/${docSnap.id}`).set(
        { pin: admin.firestore.FieldValue.delete() },
        { merge: true },
      );
      processed++;
    }

    return { processed, missingSecret, note: 'Nastav LEGACY_LOGIN_ENABLED=0 a přenasaď funkce.' };
  });
