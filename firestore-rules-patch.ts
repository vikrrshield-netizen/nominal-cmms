// NOMINAL CMMS — Firestore Rules PATCH: Status Lock pro tasks
// ============================================================
// 
// INSTRUKCE: Tento soubor NENÍ kompletní firestore.rules.
// Obsahuje POUZE pravidlo pro kolekci tasks, které nahradí
// existující match /tasks/{taskId} blok.
//
// 1. Otevři firestore.rules
// 2. Najdi:   match /tasks/{taskId} { ... }
// 3. Nahraď celý blok tímto:
// 4. Spusť:  firebase deploy --only firestore:rules
//
// ============================================================

/*
    // ═══ TASKS — Status Lock ═══
    match /tasks/{taskId} {
      // Číst může každý přihlášený
      allow read: if isAuthenticated();
      
      // Vytvořit může každý přihlášený (s timestamps)
      allow create: if isAuthenticated() && hasTimestamp();
      
      // Update — STATUS LOCK logika:
      //   1. SUPERADMIN může vždy
      //   2. Pokud task NENÍ done → normální update (s timestamp)
      //   3. Pokud task JE done → BLOKOVÁNO (jen SUPERADMIN může editovat uzavřené)
      //   4. Výjimka: přechod isDone false→true je povolený (to je samotné uzavření)
      allow update: if isAuthenticated() && hasTimestamp() && (
        // SUPERADMIN bypass
        isSuperAdmin()
        // Task ještě není uzavřený — volná editace
        || resource.data.isDone == false
        // Nebo se právě zavírá (false→true) — povoleno
        || (resource.data.isDone == false && request.resource.data.isDone == true)
      );
      
      // Soft delete — přihlášený + timestamps
      // Hard delete — jen SUPERADMIN
      allow delete: if isSuperAdmin();
    }
*/

// ============================================================
// HELPER FUNKCE (měly by už existovat v tvém rules souboru):
// 
//   function isAuthenticated() {
//     return request.auth != null;
//   }
//   function isSuperAdmin() {
//     return isAuthenticated() && 
//       get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'SUPERADMIN';
//   }
//   function hasTimestamp() {
//     return request.resource.data.updatedAt is timestamp;
//   }
//
// Pokud helper isSuperAdmin() v rules NEEXISTUJE, přidej ho
// do horní části souboru (před match bloky).
// ============================================================
