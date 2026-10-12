import { supabase } from './supabaseClient';
// ΔΙΟΡΘΩΣΗ (code review - "case-sensitivity"): το πραγματικό αρχείο είναι
// 'Devicetoken.js' - δες το ίδιο σχόλιο στο App.jsx για το γιατί αυτό
// δουλεύει τυχαία τώρα (Windows build) αλλά θα έσπαγε σε case-sensitive
// filesystem.
import { getDeviceToken } from './Devicetoken';

// Καταγράφει/ενημερώνει το guest username στη βάση (πίνακας event_guests),
// ώστε ο Admin να βλέπει λίστα με όλους όσους μπήκαν σε ένα event - είτε με
// λογαριασμό (userId) είτε ως απλός guest (device token της συσκευής).
// Ένα row ανά (event, ταυτότητα) - upsert σε κάθε είσοδο.
export async function upsertEventGuest({ eventId, name, userId }) {
  if (!eventId || !name) return;
  const trimmedName = name.trim();
  if (!trimmedName) return;

  const nowIso = new Date().toISOString();

  // Λογαριασμένος χρήστης: υπάρχει πραγματικό (όχι partial) unique index
  // event_guests_user_unique(event_id, user_id), οπότε το ON CONFLICT
  // δουλεύει κανονικά εδώ.
  if (userId) {
    const row = { event_id: eventId, user_id: userId, guest_name: trimmedName, last_seen_at: nowIso };
    const { error } = await supabase
      .from('event_guests')
      .upsert([row], { onConflict: 'event_id,user_id' });
    if (error) {
      console.log('event_guests upsert error', error.message);
    }
    return;
  }

  // ΔΙΟΡΘΩΣΗ (κρίσιμο bug - βρέθηκε από live review στο admin: η λίστα
  // καλεσμένων έμενε ΠΑΝΤΑ άδεια, για όλα τα events, παρόλο που ανέβαιναν
  // κανονικά φωτογραφίες από named guests).
  //
  // Το unique index (event_id, guest_name_key) στη βάση είναι PARTIAL
  // (WHERE user_id IS NULL) - δες migration. Το Supabase/PostgREST
  // upsert({onConflict: 'event_id,guest_name_key'}) παράγει ένα απλό
  // ON CONFLICT (event_id, guest_name_key) χωρίς τη WHERE συνθήκη, και η
  // Postgres ΔΕΝ ταιριάζει αυτόματα partial index σε τέτοιο conflict
  // target - πετάει 42P10 "there is no unique or exclusion constraint
  // matching the ON CONFLICT specification" σε ΚΑΘΕ κλήση για ανώνυμο
  // guest (επιβεβαιωμένο: ίδιο ακριβώς σφάλμα αναπαράχθηκε χειροκίνητα
  // στη βάση). Επειδή παρακάτω ποτέ δεν μπλοκάρουμε τον guest σε σφάλμα
  // (σωστή απόφαση - δεν θες να μην μπορεί να ανεβάσει φωτογραφία επειδή
  // χάλασε μόνο η καταγραφή "ποιος μπήκε"), το σφάλμα πήγαινε μόνο σε
  // console.log και χανόταν - η λίστα καλεσμένων στο admin έμενε άδεια
  // σιωπηλά, για πάντα, χωρίς κανένα ορατό σύμπτωμα.
  //
  // Fix: αντί να βασιζόμαστε σε ON CONFLICT (που δεν μπορεί να εκφράσει
  // τη συνθήκη WHERE user_id IS NULL του partial index από τον JS client),
  // κάνουμε το merge χειροκίνητα - select existing row -> update by id,
  // αλλιώς insert. Αν δύο guests γράψουν το ΑΚΡΙΒΩΣ ίδιο όνομα την ίδια
  // ακριβώς στιγμή (σπάνιο race), το insert θα αποτύχει με unique
  // violation (23505) πάνω στο partial index - σε αυτή την περίπτωση
  // ξαναδιαβάζουμε και κάνουμε update, άρα δεν χάνεται ποτέ η εγγραφή.
  const deviceToken = getDeviceToken();
  const normalizedKey = trimmedName.toLowerCase();

  try {
    const { data: existing, error: selectError } = await supabase
      .from('event_guests')
      .select('id')
      .eq('event_id', eventId)
      .is('user_id', null)
      .eq('guest_name_key', normalizedKey)
      .maybeSingle();

    if (selectError) {
      console.log('event_guests lookup error', selectError.message);
      return;
    }

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from('event_guests')
        .update({ device_token: deviceToken, guest_name: trimmedName, last_seen_at: nowIso })
        .eq('id', existing.id);
      if (updateError) {
        console.log('event_guests update error', updateError.message);
      }
      return;
    }

    const { error: insertError } = await supabase
      .from('event_guests')
      .insert([{ event_id: eventId, device_token: deviceToken, guest_name: trimmedName, last_seen_at: nowIso }]);

    if (insertError) {
      if (insertError.code === '23505') {
        // Race: κάποιος άλλος πρόλαβε να γράψει το ίδιο όνομα ανάμεσα στο
        // select και στο insert μας - ξαναδιαβάζουμε και κάνουμε update.
        const { data: raceRow, error: raceSelectError } = await supabase
          .from('event_guests')
          .select('id')
          .eq('event_id', eventId)
          .is('user_id', null)
          .eq('guest_name_key', normalizedKey)
          .maybeSingle();
        if (!raceSelectError && raceRow?.id) {
          // ΔΙΟΡΘΩΣΗ (code review - "το device_token μεταφέρεται στον λάθος
          // guest"): εδώ φτάνουμε ΜΟΝΟ όταν το INSERT μας απέτυχε με 23505,
          // δηλαδή κάποιος ΑΛΛΟΣ guest ΠΡΟΛΑΒΕ να γράψει το ΙΔΙΟ όνομα
          // ανάμεσα στο δικό μας select και insert (classic race - συχνό
          // αμέσως μετά την τελετή, όταν δεκάδες guests μπαίνουν στο ίδιο
          // λεπτό). Πριν, το update ΕΔΩ ξανάγραφε το device_token με το
          // ΔΙΚΟ ΜΑΣ (του "χαμένου" της κούρσας) - η μοναδική γραμμή
          // event_guests για αυτό το όνομα κατέληγε να δείχνει στη ΛΑΘΟΣ
          // συσκευή (του guest που ΠΡΟΛΑΒΕ), ενώ ο πρώτος guest συνέχιζε
          // κανονικά να χρησιμοποιεί την εφαρμογή με αυτό το όνομα. Τώρα
          // ΔΕΝ αγγίζουμε το device_token σε αυτό το μονοπάτι - η γραμμή
          // μένει να ανήκει σε όποιον την έγραψε πρώτος, ενημερώνουμε μόνο
          // last_seen_at (ώστε να φαίνεται "ζωντανή" στη λίστα καλεσμένων).
          const { error: raceUpdateError } = await supabase
            .from('event_guests')
            .update({ last_seen_at: nowIso })
            .eq('id', raceRow.id);
          if (raceUpdateError) {
            console.log('event_guests race-update error', raceUpdateError.message);
          }
        } else {
          console.log('event_guests race-select error', raceSelectError?.message);
        }
      } else {
        console.log('event_guests insert error', insertError.message);
      }
    }
  } catch (err) {
    console.log('upsertEventGuest unexpected error', err.message);
  }
}

// Ελέγχει αν το όνομα (case-insensitive, trimmed) το έχει ήδη πάρει ΑΛΛΗ
// συσκευή στο ίδιο event. Σκοπός: το ζευγάρι θέλει 1 πραγματικό άτομο ανά
// entry στη λίστα καλεσμένων - δύο διαφορετικοί guests με το ίδιο ακριβώς
// όνομα ("Γιώργος") θα μπέρδευαν τη λίστα, οπότε μπλοκάρουμε και τον
// καθοδηγούμε να διαφοροποιήσει (π.χ. με επώνυμο).
//
// ΣΗΜΑΝΤΙΚΟ: η ίδια συσκευή που ξαναγράφει το ΔΙΚΟ ΤΗΣ όνομα (π.χ. re-visit,
// ή απλά ξαναπατάει Join Party) ΔΕΝ πρέπει να μπλοκάρεται - γι' αυτό
// συγκρίνουμε βάσει device_token και εξαιρούμε τη δική μας συσκευή, αντί να
// κάνουμε τη σύγκριση με SQL neq (που "χάνει" σειρές με device_token = null
// λόγω του πώς δουλεύει η NULL λογική στην SQL - π.χ. έναν ήδη
// συνδεδεμένο/authenticated χρήστη με το ίδιο όνομα).
export async function checkGuestNameTaken({ eventId, name }) {
  if (!eventId || !name) return false;

  const trimmed = name.trim();
  if (!trimmed) return false;

  const { data, error } = await supabase
    .from('event_guests')
    .select('device_token')
    .eq('event_id', eventId)
    .ilike('guest_name', trimmed);

  if (error) {
    // Ποτέ δεν μπλοκάρουμε τον guest λόγω σφάλματος δικτύου/βάσης - απλά
    // τον αφήνουμε να προχωρήσει, το validation είναι best-effort.
    console.log('checkGuestNameTaken error', error.message);
    return false;
  }

  const myToken = getDeviceToken();
  return (data || []).some((row) => row.device_token !== myToken);
}