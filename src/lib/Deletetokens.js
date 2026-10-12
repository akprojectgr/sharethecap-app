// Κρατάει τοπικά, στη συσκευή του guest, το "μυστικό" token διαγραφής για
// κάθε φωτογραφία που ανέβασε ο ίδιος - έτσι μπορεί να τη σβήσει αν έκανε
// λάθος, χωρίς να χρειάζεται λογαριασμό. Το token παράγεται στο upload και
// αποθηκεύεται και στη βάση (photos.delete_token) και εδώ.
const KEY = 'klev_my_photo_tokens';

function readMap() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch (e) {
    return {};
  }
}

export function saveMyPhotoToken(photoId, token) {
  try {
    const map = readMap();
    map[photoId] = token;
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch (e) {
    // localStorage not available - ο χρήστης απλά δεν θα μπορεί να σβήσει
    // τη φωτογραφία αργότερα από αυτή τη συσκευή, δεν είναι κρίσιμο σφάλμα.
  }
}

export function getMyPhotoToken(photoId) {
  return readMap()[photoId] || null;
}

export function forgetMyPhotoToken(photoId) {
  try {
    const map = readMap();
    delete map[photoId];
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch (e) {}
}