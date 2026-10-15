import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import KlevApp from './App';
import LiveDisplay from './pages/LiveDisplay';
import Favorites from './pages/Favorites';
import './styles/global.css';

// --- PWA auto-update ---------------------------------------------------
// Το vite-plugin-pwa (registerType: 'autoUpdate') φτιάχνει ένα service
// worker που ΞΕΡΕΙ να ενημερώνεται μόνο του, αλλά χρειάζεται να το
// "ενεργοποιήσουμε" ρητά εδώ - αλλιώς ο browser ελέγχει για νέα έκδοση
// μόνο σε τυχαίες στιγμές (π.χ. όταν ξανανοίξει η καρτέλα μετά από ώρες),
// και ο χρήστης μπορεί να μείνει σε παλιά έκδοση χωρίς να το καταλάβει.
//
// Με το παρακάτω: (1) ελέγχουμε αμέσως στο load αν υπάρχει νέα έκδοση,
// (2) μόλις ο νέος service worker αναλάβει τον έλεγχο, κάνουμε αυτόματο
// reload της σελίδας - έτσι ο χρήστης βλέπει ΠΑΝΤΑ την τελευταία έκδοση,
// χωρίς να χρειάζεται ποτέ να κάνει χειροκίνητα clear cache.
import { registerSW } from 'virtual:pwa-register';
import { isUploadBusy } from './lib/uploadBusy';
// ΝΕΟ (i18n): LanguageProvider - δίνει το useLanguage()/t() hook σε όλη την
// εφαρμογή (βλ. lib/i18n.js). Default γλώσσα Αγγλικά, αποθήκευση στο
// localStorage της συσκευής.
import { LanguageProvider } from './lib/i18n';

registerSW({ immediate: true });

// ΔΙΟΡΘΩΣΗ ("ξαφνικό refresh ενώ ο guest ανέβαζε φωτογραφία" - πρώτη
// αναφορά από Xiaomi/Firefox, αλλά το bug αφορά ΚΑΘΕ browser/συσκευή): το
// αυτόματο reload παρακάτω γινόταν ΑΜΕΣΩΣ μόλις ο νέος service worker
// αναλάμβανε τον έλεγχο - χωρίς να μας ενδιαφέρει ΤΙ έκανε ο χρήστης εκείνη
// τη στιγμή. Το πρόβλημα: ο browser ελέγχει συχνότατα για νέα έκδοση
// ΑΚΡΙΒΩΣ όταν η καρτέλα ξαναγίνεται ενεργή μετά το background - και το
// άνοιγμα του native file picker (κάμερα/συλλογή) είναι σχεδόν πάντα μια
// τέτοια στιγμή. Αποτέλεσμα: ο guest επέλεγε φωτογραφία (ή ήταν ήδη μέσα σε
// upload) και η σελίδα έκανε ξαφνικό reload, σβήνοντας τα πάντα - χωρίς
// κανένα μήνυμα/προειδοποίηση. Ειδικά επιρρεπές σε αυτό ήταν το Firefox σε
// Android (πιο επιθετικός έλεγχος update σε κάθε επαναφορά focus), αλλά η
// ρίζα του προβλήματος είναι ανεξάρτητη browser - απλά εκεί "χτύπησε" πρώτα.
//
// Λύση: πριν κάνουμε reload, ρωτάμε το lib/uploadBusy.js αν ο guest
// βρίσκεται ΤΩΡΑ μέσα σε ενεργή ροή ανεβάσματος (draft φωτογραφιών ανοιχτό
// ή πραγματικό upload σε εξέλιξη - βλ. useEventPhotos.js). Αν ναι, ΔΕΝ
// κάνουμε reload τώρα - απλά σημειώνουμε ότι εκκρεμεί, και το εκτελούμε
// αυτόματα μόλις ο guest ολοκληρώσει/ακυρώσει το ανέβασμα (event
// 'klev:upload-idle', εκπέμπεται από το uploadBusy.js). Έτσι ο guest
// εξακολουθεί να παίρνει πάντα την τελευταία έκδοση - απλά όχι τη χειρότερη
// δυνατή στιγμή.
if ('serviceWorker' in navigator) {
  let refreshing = false;
  let reloadPending = false;

  const reloadIfSafe = () => {
    if (refreshing) return;
    if (isUploadBusy()) {
      reloadPending = true;
      return;
    }
    refreshing = true;
    window.location.reload();
  };

  navigator.serviceWorker.addEventListener('controllerchange', reloadIfSafe);

  window.addEventListener('klev:upload-idle', () => {
    if (reloadPending) reloadIfSafe();
  });
}
// ------------------------------------------------------------------------

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
    <BrowserRouter>
      <Routes>
        {/* Η αρχική σελίδα των καλεσμένων */}
        <Route path="/" element={<KlevApp />} />
        {/* ΔΙΟΡΘΩΣΗ (code review): το /admin αφαιρέθηκε εντελώς - δεν είχε
        ΚΑΘΟΛΟΥ authentication (οποιοσδήποτε πληκτρολογούσε /admin στο URL
        έβλεπε κουμπιά διαγραφής event/φωτογραφιών), ΚΑΙ συνδεόταν σε
        τελείως διαφορετικό Supabase project (ξεχασμένο placeholder, ποτέ
        δεν χρησιμοποιήθηκε για το πραγματικό event). Η διαχείριση γίνεται
        σκόπιμα από ξεχωριστό dashboard (portfolio), άρα δεν χρειάζεται
        καθόλου route εδώ - ένα route λιγότερο = μία λιγότερη πόρτα για
        κάποιον να ανοίξει κατά λάθος. */}
        {/* Ζωντανή προβολή σε TV/projector στο event: /display/ΚΩΔΙΚΟΣ */}
        <Route path="/display/:code" element={<LiveDisplay />} />
        {/* "Plus" των συνδεδεμένων χρηστών: αγαπημένες φωτογραφίες, μόνιμα */}
        <Route path="/favorites" element={<Favorites />} />
      </Routes>
    </BrowserRouter>
    </LanguageProvider>
  </React.StrictMode>
);