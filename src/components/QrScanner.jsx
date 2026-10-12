import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

// Κοινό, headless QR scanner component (χωρίς δικό του UI/κουμπιά - το
// controlled πλήρως από τον parent, ίδια λογική με το παλιό <QrReader/> από
// το react-qr-reader). Αντικατέστησε το react-qr-reader σε Login.jsx και
// MyEvents.jsx γιατί εκείνο δεν υποστηρίζει React 18 (peer dependency
// React 16/17) και προκαλούσε "Invalid hook call" όταν εγκαθίστατο δίπλα
// στο html5-qrcode.
//
// Χρήση: <QrScanner onResult={(decodedText) => ...} />
// - Ξεκινάει αυτόματα την κάμερα (facingMode: environment) στο mount.
// - Σταματάει καθαρά την κάμερα στο unmount (π.χ. όταν κλείνει το modal ή
//   αλλάζει tab) - σημαντικό ώστε να μη μένει αναμμένη η κάμερα στο
//   παρασκήνιο.
// - Καλεί το onResult(decodedText) σε ΚΑΘΕ επιτυχές scan (συνεχές scanning,
//   ίδιο με πριν) - ο caller είναι υπεύθυνος να αγνοήσει επόμενα results αν
//   χρειάζεται (π.χ. μέσω ενός "loading"/"already scanned" flag), ακριβώς
//   όπως γινόταν ήδη και με το react-qr-reader.
let scannerIdCounter = 0;

export default function QrScanner({ onResult, onError, className, style }) {
  const elementIdRef = useRef(`qr-scanner-${++scannerIdCounter}`);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  // ΔΙΟΡΘΩΣΗ (code review - "σιωπηλή άδεια οθόνη αν αρνηθεί κάμερα"): πριν,
  // αν το html5QrCode.start() απέτυχε (άρνηση άδειας κάμερας, καμία κάμερα
  // στη συσκευή, browser χωρίς getUserMedia), το ΜΟΝΟ που γινόταν ήταν ένα
  // console.error - ο καλεσμένος έβλεπε απλά ένα άδειο κουτί για πάντα,
  // χωρίς κανένα μήνυμα να δοκιμάσει τον κωδικό χειροκίνητα (που συνήθως
  // υπάρχει ακριβώς από κάτω). Το onError εκθέτει αυτό το σφάλμα στον
  // parent (Login.jsx/MyEvents.jsx) ώστε να δείξει ένα κατανοητό μήνυμα.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    const elementId = elementIdRef.current;
    const html5QrCode = new Html5Qrcode(elementId, { verbose: false });
    let isActive = true;

    // ΔΙΟΡΘΩΣΗ (code review - "κάμερα μένει αναμμένη στο παρασκήνιο"): το
    // start() είναι async (περιμένει π.χ. το permission prompt ή αργό
    // venue wifi/κάμερα). Πριν, αν ο χρήστης έκλεινε το modal ΠΡΙΝ
    // προλάβει να γίνει resolve το start(), το cleanup έκανε stop() αμέσως
    // - αλλά το html5-qrcode θεωρείται "ξεκινημένο" μόνο ΑΦΟΥ γίνει resolve
    // το start(), οπότε αυτό το stop() ήταν ουσιαστικά no-op (catch-άρεται
    // σιωπηλά). Όταν μετά ολοκληρωνόταν το start(), η κάμερα έμενε
    // αναμμένη στο background για πάντα (άδειαζε μπαταρία, και σε μερικά
    // browsers μπλοκάρει την επόμενη προσπάθεια scan). Κρατάμε το ίδιο το
    // promise του start() και, αν γίνει unmount πριν ολοκληρωθεί, κάνουμε
    // το stop() ΑΦΟΥ πρώτα ολοκληρωθεί (not πριν).
    const startPromise = html5QrCode
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: undefined },
        (decodedText) => {
          if (isActive) onResultRef.current?.(decodedText);
        },
        () => {
          // per-frame "δεν βρέθηκε QR σε αυτό το frame" - φυσιολογικό, το
          // αγνοούμε (δεν είναι πραγματικό σφάλμα).
        }
      )
      .then(() => {
        started = true;
      })
      .catch((err) => {
        console.error('QR camera δεν ξεκίνησε:', err);
        onErrorRef.current?.(err);
      });
    let started = false;

    return () => {
      isActive = false;
      startPromise.finally(() => {
        if (!started) return; // δεν ξεκίνησε ποτέ (άρνηση άδειας κ.λπ.) - δεν υπάρχει τίποτα να σταματήσει
        html5QrCode
          .stop()
          .then(() => html5QrCode.clear())
          .catch(() => {
            // ήδη σταματημένο/καθαρισμένο ή άλλο ασήμαντο σφάλμα - δεν πειράζει
          });
      });
    };
  }, []);

  return (
    <div
      id={elementIdRef.current}
      className={className}
      style={{ width: '100%', height: '100%', ...style }}
    />
  );
}