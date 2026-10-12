import { supabase } from './supabaseClient';
// ΔΙΟΡΘΩΣΗ (code review - "case-sensitivity"): το πραγματικό αρχείο είναι
// 'Devicetoken.js' - δες το ίδιο σχόλιο στο App.jsx.
import { getDeviceToken } from './Devicetoken';

// Το like/favorite ΔΕΝ χρειάζεται πλέον λογαριασμό - μπορεί να κάνει like
// όποιος θέλει, ακόμα κι αν είναι απλός guest χωρίς σύνδεση. Χρησιμοποιούμε
// το ίδιο μοντέλο με τα nicknames (event_guests) και τα delete tokens των
// φωτογραφιών: αν υπάρχει συνδεδεμένος χρήστης (userId) το like καταγράφεται
// στο user_id του, αλλιώς καταγράφεται στο device_token της συσκευής
// (βλέπε deviceToken.js). Αντίστοιχες RLS policies στο Supabase επιτρέπουν
// πλέον insert/delete στον πίνακα "likes" και για anon (μέσω device_token).

// Πλήθος likes ανά φωτογραφία, για μια λίστα από photo ids.
export async function fetchLikeCounts(photoIds) {
  if (!photoIds.length) return {};
  const { data, error } = await supabase
    .from('likes')
    .select('photo_id')
    .in('photo_id', photoIds);

  if (error || !data) return {};

  const counts = {};
  for (const row of data) {
    counts[row.photo_id] = (counts[row.photo_id] || 0) + 1;
  }
  return counts;
}

// Ποιες από αυτές τις φωτογραφίες έχει ήδη κάνει like ο τρέχων χρήστης -
// συνδεδεμένος (userId) ή απλός guest (device_token της συσκευής).
export async function fetchMyLikedPhotoIds(photoIds, userId) {
  if (!photoIds.length) return new Set();

  const query = supabase.from('likes').select('photo_id').in('photo_id', photoIds);
  const { data, error } = userId
    ? await query.eq('user_id', userId)
    : await query.eq('device_token', getDeviceToken());

  if (error || !data) return new Set();
  return new Set(data.map((r) => r.photo_id));
}

// ΔΙΟΡΘΩΣΗ (code review - "διπλό-tap στην καρδιά"): δύο ταχιά taps στο ίδιο
// like button (πολύ συνηθισμένο - ο κόσμος πατάει επανειλημμένα την
// καρδιά) μπορούσαν να ξεκινήσουν ΔΥΟ παράλληλα toggleLike() calls πριν
// προλάβει να ξανα-render-άρει το UI με το νέο isLiked - και τα δύο με το
// ΙΔΙΟ (παλιό) currentlyLiked, άρα και τα δύο έκαναν π.χ. insert, παράγοντας
// δύο γραμμές like για ένα λογικό "like" (λάθος μέτρημα μέχρι το επόμενο
// refetch, και ένα unlike μετά θα έσβηνε ΚΑΙ τις δύο μαζί μπερδεύοντας το
// μέτρημα ξανά). Ένα απλό in-flight lock ανά φωτογραφία/ταυτότητα αρκεί -
// το δεύτερο tap απλά αγνοείται όσο το πρώτο δεν έχει ακόμα τελειώσει.
const inFlightLikeKeys = new Set();

// Like / unlike μιας φωτογραφίας. Αν υπάρχει userId χρησιμοποιείται αυτό,
// αλλιώς το like καταγράφεται/αφαιρείται βάσει του device_token της
// συσκευής - δεν χρειάζεται πλέον λογαριασμός.
// ΔΙΟΡΘΩΣΗ (code review - "η καρδιά ξε-γίνεται μόνη της σε refresh"): πριν,
// αυτή η function ΔΕΝ ανέφερε ποτέ πραγματική αποτυχία στον caller - σε
// σφάλμα απλά έκανε console.log και επέστρεφε "σαν να πέτυχε" (ακόμα και σε
// αποτυχημένο INSERT, επέστρεφε true="liked"!). Το PhotoGallery.jsx έκανε
// ήδη optimistic update ΠΡΙΝ καλέσει αυτό, οπότε δεν υπήρχε ΚΑΝΕΝΑΣ τρόπος
// να ξέρει αν το like/unlike πραγματικά κράτησε στη βάση - σε ασταθές venue
// wifi, ο guest έβλεπε κόκκινη καρδιά που αργότερα "ξε-γινόταν" μόνη της σε
// refresh χωρίς καμία εξήγηση. Τώρα επιστρέφουμε πάντα { liked, error } -
// το error είναι null σε επιτυχία, ώστε ο caller να μπορεί να κάνει πραγματικό
// rollback στο optimistic UI όταν κάτι όντως αποτύχει.
export async function toggleLike(photoId, eventId, userId, currentlyLiked) {
  const lockKey = `${photoId}:${userId || getDeviceToken()}`;
  if (inFlightLikeKeys.has(lockKey)) {
    // Ήδη σε εξέλιξη ένα toggle για αυτή τη φωτο/χρήστη - αγνοούμε αυτό το
    // δεύτερο tap αντί να στείλουμε ΚΑΙ δεύτερο insert/delete παράλληλα.
    return { liked: currentlyLiked, error: null };
  }
  inFlightLikeKeys.add(lockKey);

  try {
    return await toggleLikeInner(photoId, eventId, userId, currentlyLiked);
  } finally {
    inFlightLikeKeys.delete(lockKey);
  }
}

async function toggleLikeInner(photoId, eventId, userId, currentlyLiked) {
  const deviceToken = userId ? null : getDeviceToken();

  if (currentlyLiked) {
    const query = supabase.from('likes').delete().eq('photo_id', photoId);
    const { error } = userId
      ? await query.eq('user_id', userId)
      : await query.eq('device_token', deviceToken);
    if (error) {
      console.log('like delete error', error.message);
      return { liked: true, error }; // δεν άλλαξε τίποτα - μένει liked
    }
    return { liked: false, error: null };
  }

  const row = userId
    ? { photo_id: photoId, event_id: eventId, user_id: userId }
    : { photo_id: photoId, event_id: eventId, device_token: deviceToken };

  const { error } = await supabase.from('likes').insert([row]);
  if (error) {
    // Εξαίρεση: "already exists" (π.χ. διπλό-tap race, δεύτερο insert για
    // ήδη υπάρχον like) ΔΕΝ είναι πραγματική αποτυχία - το like υπάρχει ήδη
    // στη βάση, άρα το optimistic "liked" state είναι σωστό, δεν χρειάζεται
    // rollback. Οποιοδήποτε άλλο σφάλμα (δίκτυο, RLS κλπ) αναφέρεται κανονικά.
    const isDuplicate = error.code === '23505';
    console.log('like insert error', error.message);
    return { liked: true, error: isDuplicate ? null : error };
  }
  return { liked: true, error: null };
}

// Όλες οι φωτογραφίες (με τα events τους) που έχει κάνει like ο
// συνδεδεμένος χρήστης - τροφοδοτεί τη σελίδα "Τα αγαπημένα μου".
// (Παραμένει user-only: χωρίς λογαριασμό δεν υπάρχει ξεχωριστή σελίδα
// "τα αγαπημένα μου" να επισκεφτεί κανείς αργότερα από άλλη συσκευή.)
export async function fetchMyFavorites(userId) {
  const { data, error } = await supabase
    .from('likes')
    .select('photo_id, created_at, photos:photo_id ( id, file_path, event_id, events:event_id ( event_name ) )')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data
    .filter((row) => row.photos) // αν κάποια φωτογραφία διαγράφηκε, το φιλτράρουμε
    .map((row) => ({
      id: row.photos.id,
      file_path: row.photos.file_path,
      event_name: row.photos.events?.event_name || '—',
      liked_at: row.created_at
    }));
}