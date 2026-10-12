// Μικρό, framework-agnostic "busy" κλείδωμα με ΠΟΛΛΑΠΛΟΥΣ ανεξάρτητους
// "λόγους" (reasons) - βλ. σχόλιο στο main.jsx για το ΓΙΑΤΙ χρειάζεται
// αυτό: το auto-update service worker εκεί κάνει force
// window.location.reload() τη στιγμή που ανιχνεύσει νέα έκδοση, και αυτή η
// στιγμή συχνά πέφτει ΑΚΡΙΒΩΣ όταν η καρτέλα ξαναγίνεται ενεργή μετά από
// background - σβήνοντας ό,τι έκανε ο guest, χωρίς καμία προειδοποίηση.
//
// Δύο ανεξάρτητοι λόγοι κρατάνε το κλείδωμα ενεργό:
//  - 'picker': όσο είναι ανοιχτό το native file picker (κάμερα/συλλογή) -
//    η καρτέλα πάει background ενώ ο guest διαλέγει, βλ. FloatingAddMenu.jsx.
//    Δεν υπάρχει αξιόπιστο "ακύρωσε το picker" event σε browsers, οπότε αυτό
//    το reason έχει ΚΑΙ ένα safety-net timeout (στο FloatingAddMenu.jsx) που
//    το ελευθερώνει μόνο του αν δεν ακολουθήσει καμία επιλογή αρχείου.
//  - 'draft': όσο υπάρχει ενεργό draft φωτογραφιών (preview modal) ή γίνεται
//    πραγματικό upload - βλ. useEventPhotos.js (derived από
//    pendingFiles/uploading, χωρίς πιθανότητα να "κολλήσει" stuck, αφού
//    ακολουθεί πιστά αυτά τα δύο state values).
//
// Ένα Set αντί για ένα απλό boolean ώστε οι δύο λόγοι να μην μπερδεύονται -
// π.χ. αν λήξει το safety-net timeout του 'picker' ενώ το 'draft' είναι
// ήδη ενεργό (πραγματικό upload σε εξέλιξη), το κλείδωμα ΠΑΡΑΜΕΝΕΙ ενεργό
// χάρη στο 'draft' - δεν λύνεται πρόωρα.
const holds = new Set();

export function acquireUploadBusy(reason) {
  holds.add(reason);
}

export function releaseUploadBusy(reason) {
  holds.delete(reason);
  if (holds.size === 0 && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('klev:upload-idle'));
  }
}

export function isUploadBusy() {
  return holds.size > 0;
}