// Cloudflare Pages Function - χειρίζεται τα "tracked scan" links της μορφής
// https://app.sharethecap.com/r/<code> που δημιουργεί το
// buildTrackedScanLink() στο src/components/SharethecapQrModal.jsx και
// μπαίνουν ΜΟΝΟ στο εκτυπωμένο QR code (όχι στο κουμπί "Αντιγραφή", που
// δίνει το απευθείας link χωρίς /r/).
//
// ΣΤΟΧΟΣ: όταν κάποιος σκανάρει το QR, να καταγράφεται το scan και μετά να
// γίνεται redirect στο πραγματικό event link (/?code=<code>), ώστε ο guest
// να μπαίνει κανονικά στο event.
//
// Μέχρι τώρα αυτό ΔΕΝ υπήρχε καθόλου - το /r/<code> δεν το έπιανε τίποτα
// (ούτε Cloudflare Function ούτε React Router route), οπότε μετά την
// προσθήκη του public/_redirects έπεφτε στο SPA και ο React Router έσκαγε
// με "No routes matched location /r/<code>".
//
// Το logging του scan είναι ΠΡΟΑΙΡΕΤΙΚΟ προς το παρόν (δεν υπάρχει ακόμα
// πίνακας/στήλη στο Supabase για μέτρηση scans) - αν σκάσει το fetch για
// οποιονδήποτε λόγο, ΔΕΝ μπλοκάρει το redirect. Αν θες πραγματική μέτρηση
// scans (π.χ. στήλη scan_count στο events, ή ξεχωριστός πίνακας scans με
// timestamp), πες μου και το προσθέτουμε.
const SUPABASE_URL = 'https://jxfaoxcasdqjrbdqeoan.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4ZmFveGNhc2RxanJiZHFlb2FuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1ODUyNjgsImV4cCI6MjEwNDE2MTI2OH0.rcVYeet2n2AsLWRaMI4E2W_0r9NqDlTsT4ehi0M3N9k';

export async function onRequest(context) {
  const { request, params } = context;
  const url = new URL(request.url);
  const code = params.code;

  if (!code) {
    return Response.redirect(`${url.origin}/`, 302);
  }

  // Σιωπηλή προσπάθεια καταγραφής scan (best-effort, ΔΕΝ μπλοκάρει ποτέ το
  // redirect αν αποτύχει - π.χ. δεν υπάρχει ακόμα το πεδίο last_scanned_at).
  try {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 2000);
    try {
      await fetch(
        `${SUPABASE_URL}/rest/v1/events?event_code=eq.${encodeURIComponent(code)}`,
        {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ last_scanned_at: new Date().toISOString() }),
          signal: abortController.signal,
        }
      );
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err) {
    // Αγνοείται σκόπιμα - το redirect πρέπει να γίνεται πάντα.
  }

  return Response.redirect(
    `${url.origin}/?code=${encodeURIComponent(code)}`,
    302
  );
}
