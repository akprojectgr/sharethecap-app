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
// ΕΝΗΜΕΡΩΣΗ: το παλιό σχόλιο εδώ έλεγε ότι δεν υπάρχει πίνακας για μέτρηση
// scans - δεν ισχύει πια, υπάρχει το public.qr_scans (event_id, scanned_at,
// user_agent, referrer) και το διαβάζει το SharethecapQrStats.jsx στο admin.
// Το PATCH στο events.last_scanned_at (παρακάτω) ΔΕΝ εγγράφει ποτέ σε αυτόν
// τον πίνακα - γι' αυτό τα "Στατιστικά QR" έδειχναν πάντα παλιά/καθόλου
// scans παρόλο που το QR σκαναριζόταν κανονικά. Τώρα κάνουμε INSERT στο
// qr_scans (βρίσκοντας πρώτα το event_id από το event_code) ΚΑΙ κρατάμε το
// PATCH στο last_scanned_at για συμβατότητα με ό,τι το διαβάζει ήδη.
//
// Το logging του scan παραμένει best-effort (δεν υπάρχει ακόμα RLS θέμα -
// διορθώθηκε - αλλά αν σκάσει για οποιονδήποτε λόγο, ΔΕΝ μπλοκάρει το
// redirect).
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
  // redirect αν αποτύχει - π.χ. δικτυακό πρόβλημα προς το Supabase).
  try {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 3000);
    try {
      // 1. Βρες το event_id (uuid) από τον κωδικό event - το qr_scans
      //    χρειάζεται το πραγματικό uuid, όχι το event_code.
      const lookupRes = await fetch(
        `${SUPABASE_URL}/rest/v1/events?event_code=eq.${encodeURIComponent(code)}&select=id`,
        {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          signal: abortController.signal,
        }
      );
      const rows = await lookupRes.json().catch(() => []);
      const eventId = Array.isArray(rows) && rows[0] ? rows[0].id : null;

      if (eventId) {
        // 2. Πραγματική καταγραφή του scan στο qr_scans + 3. ενημέρωση
        //    last_scanned_at στο events, παράλληλα.
        await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/qr_scans`, {
            method: 'POST',
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({
              event_id: eventId,
              user_agent: request.headers.get('user-agent') || null,
              referrer: request.headers.get('referer') || null,
            }),
            signal: abortController.signal,
          }),
          fetch(
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
          ),
        ]);
      }
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