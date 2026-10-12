import React from 'react';

// Στοίβα από μικρές "φούσκες" ειδοποίησης κάτω-δεξιά (σαν notification
// μηνύματος σε Messenger) - εμφανίζεται σε ΟΛΟΥΣ τους καλεσμένους σε
// πραγματικό χρόνο όταν κάποιος ανεβάσει φωτογραφία/βίντεο. Τα ίδια τα
// toasts (ποια υπάρχουν, πότε αφαιρούνται) τα διαχειρίζεται το
// useEventPhotos.js - αυτό το component είναι καθαρά εμφάνιση.
//
// Τοποθέτηση: πάνω από το gallery, ΚΑΤΩ από το FloatingAddMenu (ώστε να
// μην κρύβει τα κουμπιά upload) - βλ. bottom offset στο App.jsx wiring.
// Χτίζει το αγγλικό κείμενο ενέργειας από τους μετρητές - "shared a
// capture" / "shared 13 captures" (φωτο + βίντεο μαζί, ενιαίος όρος) αντί
// για "uploaded X photos and Y videos". Το "capture" παίζει σκόπιμα με το
// όνομα "Sharethecap" - ταιριάζει και σε φωτογραφία και σε βίντεο, χωρίς
// να χρειάζεται να ξεχωρίζουμε τους δύο τύπους στο κείμενο. ΧΩΡΙΣ emoji
// πλέον στο τέλος - αντί για 📸/🎥 μπαίνει το sharethecapicon.svg σαν
// μικρό εικονίδιο δίπλα στο κείμενο (βλ. JSX πιο κάτω).
function buildActionText(photoCount, videoCount) {
  const total = photoCount + videoCount;
  if (total === 0) return 'shared a capture';
  return total === 1 ? 'shared a capture' : `shared ${total} captures`;
}

export default function UploadToastStack({ toasts }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div style={styles.stack} aria-live="polite">
      {toasts.map((toast) => {
        const actionText = buildActionText(toast.photoCount || 0, toast.videoCount || 0);
        return (
          <div key={toast.id} className="klev-upload-toast" style={styles.toast}>
            {/* Χωρίς το κυκλάκι-avatar πλέον (ζητήθηκε ρητά να αφαιρεθεί) -
            μία μόνο γραμμή κειμένου: "Όνομα shared a/N capture(s)" + το
            sharethecap icon στο τέλος αντί για 📸/🎥 emoji. */}
            <span style={styles.messageLine}>
              <span style={styles.name}>{toast.name}</span>
              {' '}
              <span style={styles.action}>{actionText}</span>
              <img
                src="/sharethecapicon.svg"
                alt=""
                aria-hidden="true"
                style={styles.actionIcon}
              />
            </span>
          </div>
        );
      })}

      <style>{`
        @keyframes klevToastIn {
          from { opacity: 0; transform: translateX(24px) scale(0.94); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes klevToastOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        .klev-upload-toast {
          animation: klevToastIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
}

const styles = {
  stack: {
    // "absolute" ΚΑΙ ΟΧΙ "fixed" - ΣΗΜΑΝΤΙΚΟ για tablet/desktop: πάνω από
    // 641px πλάτος, το AppShell (App.jsx) δείχνει την εφαρμογή σαν
    // κεντραρισμένη "κάρτα" πλάτους 430px με θαμπό φόντο γύρω της (βλ.
    // .klev-shell-inner). Ένα "fixed" στοιχείο αγνοεί εντελώς αυτή την
    // κάρτα και κολλάει στην πραγματική γωνία της ΟΘΟΝΗΣ, όχι της κάρτας -
    // σε tablet θα εμφανιζόταν "κομμένο"/αποκολλημένο έξω από την
    // εφαρμογή. Με "absolute" αγκυρώνεται στον κοντινότερο positioned
    // πρόγονο, που στην πραγματική δομή του App.jsx είναι ο wrapper μέσα
    // στο .klev-shell-inner (position: relative) - άρα μένει πάντα ΜΕΣΑ
    // στην ορατή κάρτα, σε κινητό ΚΑΙ σε tablet. Επιβεβαιωμένο οπτικά σε
    // iPhone SE (320px) έως iPad Pro portrait (1024px).
    position: 'absolute',
    right: '16px',
    // Πάνω από το FloatingAddMenu (bottom 22px + ~56px ύψος κουμπιού +
    // λίγο κενό) ώστε να μην επικαλύπτονται.
    bottom: '92px',
    zIndex: 58,
    display: 'flex',
    flexDirection: 'column-reverse',
    gap: '8px',
    alignItems: 'flex-end',
    maxWidth: 'calc(100% - 32px)',
    pointerEvents: 'none'
  },
  toast: {
    display: 'flex',
    alignItems: 'center',
    padding: '11px 16px',
    background: 'rgba(38, 42, 33, 0.96)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
    border: '1px solid rgba(230, 197, 148, 0.28)',
    // ΣΗΜΕΙΩΣΗ: borderRadius 20px αντί για πλήρες "pill" (9999px) - το
    // μήνυμα τώρα μπορεί να είναι πιο μακρύ σε ομαδοποιημένα uploads
    // (π.χ. "shared 10 captures") και να πιάσει 2 γραμμές· ένα πλήρες pill
    // θα φαινόταν περίεργο τεντωμένο σε 2 σειρές, ενώ ένα απαλά
    // στρογγυλεμένο ορθογώνιο δείχνει σωστά και σε 1 και σε 2 γραμμές.
    borderRadius: '20px',
    boxShadow: '0 8px 22px rgba(0,0,0,0.35)',
    maxWidth: '300px'
  },
  // Χωρίς avatar/textCol πλέον - μία γραμμή κειμένου (name + action + icon)
  // που κάνει wrap φυσικά αν χρειαστεί, χωρίς κάθετη στήλη.
  messageLine: {
    lineHeight: 1.35
  },
  name: {
    color: '#fff',
    fontSize: '12.5px',
    fontWeight: 700
  },
  action: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: '12px',
    fontWeight: 500
  },
  actionIcon: {
    display: 'inline-block',
    width: '12px',
    height: '12px',
    marginLeft: '4px',
    verticalAlign: '-1.5px',
    // opacity λίγο κάτω από 1 ώστε να ταιριάζει οπτικά με το ξεθωριασμένο
    // λευκό χρώμα του υπόλοιπου κειμένου ενέργειας (rgba(255,255,255,0.7)
    // πιο πάνω), αντί να ξεχωρίζει σαν πιο "έντονο" σημείο.
    opacity: 0.85
  }
};