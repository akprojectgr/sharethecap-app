// Ένα σταθερό, τυχαίο αναγνωριστικό της συσκευής/browser (όχι λογαριασμού).
// Χρησιμοποιείται ώστε ένας guest χωρίς λογαριασμό να μπορεί να κάνει like
// σε φωτογραφίες και το σύστημα να θυμάται τι έχει ήδη κάνει like, χωρίς
// να χρειάζεται sign in.
const KEY = 'klev_device_token';

export function getDeviceToken() {
  try {
    let token = localStorage.getItem(KEY);
    if (!token) {
      token = crypto.randomUUID();
      localStorage.setItem(KEY, token);
    }
    return token;
  } catch (e) {
    // Fallback αν δεν υπάρχει καθόλου localStorage (ιδιωτική περιήγηση κ.λπ.)
    return 'no-storage-' + Math.random().toString(36).slice(2);
  }
}