// ΔΙΟΡΘΩΣΗ (feedback χρήστη - "πετάει ένα σφάλμα ακατανόητο και λέει τι
// μαλακιά εφαρμογή, χωρίς να έχει καταλάβει ότι μπορεί να είναι λάθος
// δικτύου"): σε αρκετά σημεία της εφαρμογής δείχναμε ΩΜΟ err.message
// απευθείας στον χρήστη (π.χ. AuthForm, MyEvents join, AccountSettings) -
// αυτό μπορεί να είναι οτιδήποτε: ένα αγγλικό browser/network σφάλμα
// ("Failed to fetch", "NetworkError when attempting to fetch resource",
// "Load failed"), ή ένα ωμό Postgres/Supabase σφάλμα (π.χ. όνομα
// constraint, "JWT expired" κλπ) - τίποτα από αυτά δεν λέει τίποτα σε έναν
// καλεσμένο γάμου, απλά δείχνει "χαλασμένη" εφαρμογή.
//
// Αυτό το helper κεντρικοποιεί τη λογική "τι δείχνουμε στον χρήστη":
//  1. Αν το μήνυμα μοιάζει με δικτυακό σφάλμα (ο browser δεν κατάφερε καν
//     να στείλει το αίτημα - στιγμιαία πτώση WiFi/data, όχι πρόβλημα της
//     εφαρμογής) -> δείχνουμε ρητά ότι είναι θέμα σύνδεσης, με πρόταση να
//     ξαναδοκιμάσει.
//  2. Αν το μήνυμα είναι ήδη δικό μας, γραμμένο ρητά στα Ελληνικά (π.χ.
//     new Error('Αυτό το όνομα υπάρχει ήδη...')) -> είναι ήδη φιλικό, το
//     δείχνουμε όπως είναι.
//  3. Οτιδήποτε άλλο (ωμό, τεχνικό, αγγλικό σφάλμα από Supabase/Postgres/
//     browser) -> ΠΟΤΕ δεν δείχνεται ωμό· πέφτουμε στο γενικό, φιλικό
//     fallback μήνυμα που δίνει κάθε caller.
const GREEK_CHARS = /[Ͱ-Ͽἀ-῿]/;

function looksLikeNetworkError(message) {
  const msg = (message || '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') ||
    msg.includes('err_internet_disconnected') ||
    msg.includes('err_network') ||
    msg.includes('err_connection')
  );
}

// ΔΙΟΡΘΩΣΗ (feedback χρήστη - "η εφαρμογή θα βρίσκεται σε κάποιο κέντρο/
// κτήμα, όχι στο σπίτι του καθενός· το να του λες 'έλεγξε το WiFi σου'
// είναι σαν να λες ότι φταίει το κτήμα ή τα δεδομένα του"): το αρχικό
// μήνυμα ανέφερε ρητά "WiFi/δίκτυό σου", που ουσιαστικά ρίχνει το φταίξιμο
// είτε στο δίκτυο του χώρου είτε στη σύνδεση του καλεσμένου - κάτι που δεν
// το ξέρουμε σίγουρα (μπορεί να είναι και στιγμιαίο θέμα του server) και
// δεν χρειάζεται να υπονοείται. Τώρα το μήνυμα είναι ουδέτερο: λέει απλά
// ότι χάθηκε η σύνδεση για λίγο, χωρίς να προσδιορίζει ποιανού "φταίει".
export const NETWORK_ERROR_MESSAGE =
  'Χάθηκε η σύνδεση για λίγο - δοκίμασε ξανά σε λίγα δευτερόλεπτα.';

export function friendlyErrorMessage(err, fallback) {
  const message = err?.message;
  if (typeof message === 'string' && message.trim()) {
    if (looksLikeNetworkError(message)) {
      return NETWORK_ERROR_MESSAGE;
    }
    if (GREEK_CHARS.test(message)) {
      return message;
    }
  }
  return fallback;
}
