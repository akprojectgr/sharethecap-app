import React, { useRef } from 'react';
import { acquireUploadBusy, releaseUploadBusy } from '../lib/uploadBusy';

// Αν ο browser υποστηρίζει getUserMedia + MediaRecorder, ανοίγουμε τη
// βίντεο-εγγραφή ΜΕΣΑ στη σελίδα (VideoRecorder.jsx) αντί να περάσουμε από
// τη native Camera app της συσκευής - αυτό αποφεύγει το γνωστό Android
// πρόβλημα όπου το background tab σκοτώνεται κατά την εγγραφή βίντεο και
// χάνεται το αρχείο (βλ. σχόλια στο VideoRecorder.jsx). Σε πολύ παλιούς/μη
// υποστηριζόμενους browsers κάνουμε fallback στο παλιό native-camera input.
const supportsInAppVideoRecording =
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices &&
  !!navigator.mediaDevices.getUserMedia &&
  typeof window !== 'undefined' &&
  !!window.MediaRecorder;

// Ίδιος λόγος, για φωτογραφία (βλ. σχόλιο στην κορυφή του PhotoCapture.jsx):
// εδώ δεν χρειάζεται MediaRecorder (μόνο getUserMedia + canvas snapshot),
// άρα η προϋπόθεση είναι ελαφρώς πιο χαλαρή απ' ό,τι για βίντεο.
const supportsInAppPhotoCapture =
  typeof navigator !== 'undefined' &&
  !!navigator.mediaDevices &&
  !!navigator.mediaDevices.getUserMedia;

// ΔΙΟΡΘΩΣΗ (design review - "το μωβ δεν ταιριάζει με την παλέτα, το τρίτο
// κουμπί δείχνει αδύναμο/ασύνδετο"): τα 3 κουμπιά του υπο-μενού (φωτο/
// βίντεο/συλλογή) είχαν τυχαία, ασύνδετα χρώματα μεταξύ τους - πορτοκαλί
// gradient, μωβ gradient (δεν υπάρχει πουθενά αλλού στην παλέτα της
// εφαρμογής - φαίνεται τυχαίο), και ένα τρίτο με μόνο περίγραμμα χωρίς
// γέμισμα (οπτικά πολύ πιο "αδύναμο" από τα άλλα δύο). Ενιαίο σκούρο
// "glass" ύφος για ΚΑΙ ΤΑ ΤΡΙΑ τώρα - ίδια γλώσσα με το υπόλοιπο app
// (bottom bar, input box στο Guestsignin κλπ) - διαφοροποιημένα ΜΟΝΟ με
// το ίδιο το εικονίδιο (κάμερα/βίντεο/συλλογή είναι ήδη οπτικά ξεχωριστά
// σχήματα, δεν χρειάζεται χρώμα για να τα ξεχωρίσει κανείς).
function subButtonStyle(uploading) {
  return {
    width: '46px',
    height: '46px',
    borderRadius: '50%',
    border: '1px solid rgba(230, 197, 148, 0.3)',
    cursor: uploading ? 'default' : 'pointer',
    opacity: uploading ? 0.6 : 1,
    background: 'rgba(255,255,255,0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
  };
}

export default function FloatingAddMenu({
  addMenuOpen,
  setAddMenuOpen,
  uploading,
  inviteFileInputRef,
  cameraFileInputRef,
  videoCaptureFileInputRef,
  onFileUpload,
  onOpenVideoRecorder,
  onOpenPhotoCapture,
  hasDraft,
  onResumeDraft
}) {
  // ΔΙΟΡΘΩΣΗ ("ξαφνικό refresh στην κάμερα/gallery πριν καν προλάβει να
  // προσθέσει τη φωτογραφία"): το άνοιγμα του native picker (κάμερα ή
  // συλλογή) βάζει την καρτέλα background - ακριβώς η στιγμή που το
  // auto-update service worker (main.jsx) μπορεί να κάνει force reload αν
  // βρει νέα έκδοση, σβήνοντας τα πάντα ΠΡΙΝ καν προλάβει ο guest να
  // επιλέξει/επιβεβαιώσει τη φωτογραφία. Το 'picker' reason (lib/uploadBusy.js)
  // κρατάει "κλειδωμένο" το reload ΟΣΟ διάστημα είναι ανοιχτό το picker. Δεν
  // υπάρχει αξιόπιστο "ο χρήστης ακύρωσε" event σε browsers για file inputs -
  // γι' αυτό υπάρχει και το safety-net timeout: αν δεν ακολουθήσει καμία
  // επιλογή αρχείου (onChange -> useEventPhotos.js releaseUploadBusy) μέσα σε
  // 90 δευτ., το κλείδωμα λύνεται μόνο του ώστε να μην μείνει "κολλημένο".
  const pickerHoldTimeoutRef = useRef(null);

  const openPicker = (inputRef) => {
    acquireUploadBusy('picker');
    clearTimeout(pickerHoldTimeoutRef.current);
    pickerHoldTimeoutRef.current = setTimeout(() => {
      releaseUploadBusy('picker');
    }, 90 * 1000);
    inputRef.current?.click();
  };

  return (
    <>
      {/* Συλλογή (gallery/files) - δείχνει ΚΑΙ φωτογραφίες ΚΑΙ βίντεο, ο
      guest διαλέγει ό,τι θέλει από ό,τι έχει ήδη στη συσκευή του. */}
      <input
        ref={inviteFileInputRef}
        type="file"
        accept="image/*,video/*,.heic,.heif"
        multiple
        style={{ display: 'none' }}
        onChange={onFileUpload}
      />

      {/* Κάμερα - ΜΟΝΟ φωτογραφία. Δεν συνδυάζουμε accept="image/*,video/*"
      με capture εδώ γιατί σε πολλές συσκευές (ειδικά iOS Safari) η κάμερα
      τότε ανοίγει ΠΑΝΤΑ σε photo mode και αγνοεί το video/* - δεν δίνει καν
      επιλογή. Με accept="image/*" καθαρό, η κάμερα ανοίγει αξιόπιστα σε
      λήψη φωτογραφίας. */}
      <input
        ref={cameraFileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        capture="environment"
        style={{ display: 'none' }}
        onChange={onFileUpload}
      />

      {/* Κάμερα - ΜΟΝΟ βίντεο. Ξεχωριστό input με accept="video/*" καθαρό,
      ώστε η κάμερα να ανοίγει κατευθείαν σε λήψη βίντεο σε όλες τις
      συσκευές (ίδιος λόγος με παραπάνω, αντίστροφα). */}
      <input
        ref={videoCaptureFileInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={onFileUpload}
      />

      {addMenuOpen && !hasDraft && (
        <div
          onClick={() => setAddMenuOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 55
          }}
        />
      )}

      <div style={{
        position: 'fixed',
        right: '22px',
        bottom: '22px',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center'
      }}>
        {addMenuOpen && !hasDraft && (
          // ΔΙΟΡΘΩΣΗ (design review - "είναι smooth το άνοιγμα;"): πριν
          // εμφανιζόταν ακαριαία (instant pop, καθόλου animation) - τώρα
          // μπαίνει με απαλό fade+scale από τη γωνία του κύριου κουμπιού
          // (transformOrigin bottom right), ώστε να δείχνει ότι "βγαίνει"
          // από το FAB αντί να εμφανίζεται ξαφνικά στο κενό.
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginRight: '12px',
            padding: '8px',
            background: 'rgba(38, 42, 33, 0.95)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(230, 197, 148, 0.25)',
            borderRadius: '9999px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            transformOrigin: 'bottom right',
            animation: 'menuPopIn 0.22s cubic-bezier(.22,.9,.3,1.3)'
          }}>
            <button
              type="button"
              onClick={() => {
                setAddMenuOpen(false);
                // ΠΡΟΕΠΙΛΟΓΗ σε ΟΛΟΥΣ: in-app PhotoCapture (ΟΧΙ η native
                // κάμερα) - ΕΠΙΤΗΔΕΣ, παρά το μικρό κόστος σε ποιότητα.
                //
                // Ο λόγος: η native κάμερα βγάζει καλύτερη φωτογραφία, αλλά
                // αν σκοτωθεί το tab ενώ είναι ανοιχτή (background-kill,
                // βλ. PhotoCapture.jsx) η φωτογραφία ΧΑΝΕΤΑΙ ολοκληρωτικά -
                // και σε γάμο αυτή η φωτογραφία μπορεί να είναι ο χορός, το
                // φιλί, το κόψιμο της τούρτας - όχι κάτι που ξαναγίνεται.
                // Δοκιμάσαμε "προεπιλογή native + αθόρυβη εναλλαγή ΜΕΤΑ από
                // μία αποδεδειγμένη απώλεια" (βλ. lib/cameraSafeMode.js),
                // αλλά αυτό σημαίνει ότι ΚΑΠΟΙΟΣ guest θα χάσει σίγουρα μία
                // φορά για να "μάθει" το σύστημα - μη αποδεκτό ρίσκο για
                // ανεπανάληπτες στιγμές. Επιπλέον δεν μπορούμε να
                // προβλέψουμε ΕΚ ΤΩΝ ΠΡΟΤΕΡΩΝ ποια συσκευή κινδυνεύει (το
                // Firefox σκόπιμα δεν αποκαλύπτει κατασκευαστή/μοντέλο
                // συσκευής στη JavaScript, σε αντίθεση με το Chrome) - άρα
                // δεν υπάρχει αξιόπιστος τρόπος να "μαντέψουμε" πριν
                // συμβεί. Το PhotoCapture ζητάει ρητά 4K ώστε η διαφορά
                // ποιότητας να είναι όσο το δυνατό μικρότερη.
                if (supportsInAppPhotoCapture && onOpenPhotoCapture) {
                  onOpenPhotoCapture();
                  return;
                }
                // Fallback ΜΟΝΟ αν δεν υποστηρίζεται καν getUserMedia σε
                // αυτόν τον browser (πολύ σπάνιο σήμερα).
                openPicker(cameraFileInputRef);
              }}
              disabled={uploading}
              aria-label="Τραβήξτε φωτογραφία"
              style={subButtonStyle(uploading)}
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13.5" r="3.6" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => {
                setAddMenuOpen(false);
                if (supportsInAppVideoRecording && onOpenVideoRecorder) {
                  onOpenVideoRecorder();
                } else {
                  openPicker(videoCaptureFileInputRef);
                }
              }}
              disabled={uploading}
              aria-label="Λήψη βίντεο"
              style={subButtonStyle(uploading)}
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="6" width="14" height="12" rx="2" />
                <path d="M16 10l5.5-3.2a1 1 0 0 1 1.5.87v8.66a1 1 0 0 1-1.5.86L16 14" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => {
                setAddMenuOpen(false);
                openPicker(inviteFileInputRef);
              }}
              disabled={uploading}
              aria-label="Επιλογή από τη συλλογή"
              style={subButtonStyle(uploading)}
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="7" width="15" height="15" rx="2" />
                <path d="M8 7V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-3" />
                <path d="M6.5 18.5 L10 14 l2.5 3 3-4 4 5.5" />
              </svg>
            </button>
          </div>
        )}

        {/* ΔΙΟΡΘΩΣΗ (design review): δοκιμάσαμε συνεχή ambient κίνηση στο FAB
        (δαχτυλίδι-pulse, μετά breathing-scale) για να τραβάει περισσότερο
        το μάτι - αλλά σε κάθε εκδοχή κάτι δεν πήγαινε καλά, τελευταίο
        παράπονο "σαν να κολλάει" (πιθανό πραγματικό performance θέμα: το
        box-shadow του κουμπιού δεν επιταχύνεται καλά από GPU σε
        φθηνότερα/παλιότερα κινητά, άρα μια ΣΥΝΕΧΗΣ animation πάνω του
        μπορεί όντως να κολλάει σε μέρος των 200 καλεσμένων). Αποφασίστηκε
        να ΜΗΝ έχει συνεχή κίνηση - το κουμπί είναι ήδη αρκετά διακριτό
        (έντονο χρώμα σε σκούρο φόντο, καθαρό εικονίδιο, σταθερή θέση) χωρίς
        να χρειάζεται κίνηση, και αποφεύγεται το ρίσκο για jank σε real
        devices τη βραδιά του γάμου. */}
        <div
          style={{
            position: 'relative',
            width: '56px',
            height: '56px',
            flexShrink: 0
          }}
        >
          <button
          type="button"
          onClick={() => {
            if (uploading) return;
            // Αν υπάρχει κρυμμένο draft (ο χρήστης έκλεισε το preview με
            // swipe-down χωρίς να πατήσει "Απόρριψη όλων"), το κουμπί απλά
            // ξανανοίγει τις ίδιες φωτογραφίες αντί να ανοίξει νέο file
            // picker ή το camera/gallery υπο-μενού.
            if (hasDraft) {
              onResumeDraft?.();
              return;
            }
            setAddMenuOpen((open) => !open);
          }}
          disabled={uploading}
          aria-label={uploading ? 'Ανεβαίνει…' : hasDraft ? 'Συνέχεια επεξεργασίας φωτογραφιών' : addMenuOpen ? 'Κλείσιμο' : 'Προσθήκη φωτογραφίας'}
          style={{
            position: 'relative',
            width: '56px',
            height: '56px',
            // ΔΙΟΡΘΩΣΗ (design review - "μήπως το λογότυπο να μην είναι εδώ
            // αλλά αλλού, εκεί που αποφασίζει ο χρήστης τι θα κάνει
            // χρειάζεται σαφήνεια όχι brand"): γυρνάμε σε κύκλο + camera
            // icon (βλ. σχόλιο στο εικονίδιο παρακάτω). Το λογότυπο
            // (button.svg) έχει ήδη τη θέση του στο TopBar - δεν χρειάζεται
            // να "δουλεύει" ΚΑΙ ως το κύριο action-trigger, όπου η άμεση
            // σαφήνεια ("πάτα εδώ για να προσθέσεις φωτογραφία") μετράει
            // περισσότερο από brand αναγνωρισιμότητα.
            borderRadius: '50%',
            border: '1.5px solid rgba(230, 197, 148, 0.4)', // Διακριτικό χρυσαφί περίγραμμα για βάθος
            cursor: uploading ? 'default' : 'pointer',
            background: '#8E3E12',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 20px rgba(0,0,0,0.4), inset 0 1px 2px rgba(255,255,255,0.2)', // Απαλή εσωτερική λάμψη αντί για μπάλα
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            // ΔΙΟΡΘΩΣΗ: το παλιό rotate(45deg) μετέτρεπε οπτικά το "+" σε
            // "×" όταν ανοίγει το μενού - κομψό κόλπο, αλλά δούλευε ΜΟΝΟ
            // επειδή το εικονίδιο ήταν συμμετρικό "+". Τώρα που το
            // εικονίδιο είναι κάμερα (μη συμμετρικό), η περιστροφή θα
            // έδειχνε απλά μια λοξή κάμερα χωρίς νόημα - αντικαταστάθηκε
            // με απλό scale-in feedback στο πάτημα, και το ίδιο το
            // εικονίδιο αλλάζει πλέον σε καθαρό "×" όταν είναι ανοιχτό
            // (βλ. παρακάτω) αντί να βασίζεται σε rotation.
            transform: addMenuOpen && !hasDraft ? 'scale(0.93)' : 'scale(1)',
            opacity: uploading ? 0.7 : 1,
            flexShrink: 0,
            // Αφαιρεί το default γκρι "flash"/highlight box που δείχνουν
            // οι browsers σε κινητό (κυρίως Android/Chrome) πάνω σε
            // tappable στοιχεία όσο κρατάς πατημένο, και το μπλε/γκρι
            // περίγραμμα εστίασης (focus outline) - το κουμπί έχει ήδη δικό
            // του οπτικό feedback (rotate + shadow), δεν χρειάζεται το
            // browser default.
            WebkitTapHighlightColor: 'transparent',
            outline: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none'
          }}
        >
          {uploading ? (
            <div style={{
              width: '18px',
              height: '18px',
              borderRadius: '50%',
              border: '2.5px solid rgba(255,255,255,0.35)',
              borderTopColor: '#fff',
              animation: 'spin 0.8s linear infinite'
            }} />
          ) : addMenuOpen && !hasDraft ? (
            // Καθαρό "×" όσο είναι ανοιχτό το υπο-μενού. ΔΙΟΡΘΩΣΗ (design
            // review - "απότομη αλλαγή icon"): η εναλλαγή κάμερα/"×" ήταν
            // ακαριαία (conditional render swap, χωρίς crossfade). Μικρό
            // fade+scale-in animation σε κάθε εμφάνιση - React ήδη κάνει
            // mount/unmount σε κάθε toggle, άρα η CSS animation "παίζει"
            // αυτόματα από την αρχή σε κάθε άνοιγμα/κλείσιμο.
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#fff"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ animation: 'iconFadeIn 0.18s ease' }}
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            // ΔΙΟΡΘΩΣΗ (design review - "βαρετό camera icon"): δοκιμάσαμε
            // πρώτα το brand λογότυπο (πολύ "φορτωμένο" για action-trigger),
            // μετά απλή κάμερα (σαφές αλλά γενικό/βαρετό - ίδιο παράπονο με
            // το αρχικό "+"). Μέση λύση: η ίδια καθαρή κάμερα (παραμένει
            // αμέσως κατανοητή) + μια μικρή χρυσή "σπίθα" στη γωνία - το
            // ίδιο μοτίβο αστεριού από το button.svg - δίνει μια πινελιά
            // brand/προσωπικότητας χωρίς να θυσιάζει τη σαφήνεια. Λεπτότερο
            // περίγραμμα (1.8 αντί για 2.1) - ίδιο "premium" ύφος με την
            // καρδιά στο PhotoGallery.jsx.
            <span style={{ position: 'relative', display: 'inline-flex', animation: 'iconFadeIn 0.18s ease' }}>
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13.5" r="3.6" />
              </svg>
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="#E6C594"
                style={{ position: 'absolute', top: '-5px', right: '-6px' }}
                aria-hidden="true"
              >
                <path d="M12 2c0 3.2-1 5.4-2.2 6.6S6.2 11 2 11c4.2 0 6.4 1 7.6 2.2S12 17.8 12 21c0-3.2 1-5.4 2.2-6.6S18.2 11 22 11c-4.2 0-6.4-1-7.6-2.2S12 5.2 12 2z" />
              </svg>
            </span>
          )}

          {/* Μικρή χρυσή κουκκίδα: δείχνει ότι υπάρχει draft περιμένοντας */}
          {hasDraft && !uploading && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: '-2px',
                right: '-2px',
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                background: '#D9B54A',
                border: '2px solid #1a4377',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.15)'
              }}
            />
          )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes menuPopIn {
          from { opacity: 0; transform: scale(0.85) translateY(6px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes iconFadeIn {
          from { opacity: 0; transform: scale(0.75); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}