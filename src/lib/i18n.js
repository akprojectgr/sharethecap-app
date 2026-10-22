import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

// ΝΕΟ (i18n): απλό, ελαφρύ σύστημα μετάφρασης - χωρίς εξωτερική βιβλιοθήκη
// (δεν αξίζει ένα ολόκληρο i18n framework για 2 γλώσσες σε μια μικρή PWA).
// Default γλώσσα: Αγγλικά (ζητήθηκε ρητά - "by default θα είναι αγγλικά").
// Η επιλογή αποθηκεύεται στο localStorage της συσκευής - μία φορά ανά
// συσκευή, μένει ίδια μέχρι να την αλλάξει ο ίδιος ο guest.
export const LANGUAGE_STORAGE_KEY = 'klev_language';
export const DEFAULT_LANGUAGE = 'en';

export function getStoredLanguage() {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === 'en' || stored === 'el') return stored;
  } catch (e) {
    // localStorage μπορεί να μην είναι διαθέσιμο (private mode κλπ) - OK,
    // απλά πέφτουμε στο default.
  }
  return DEFAULT_LANGUAGE;
}

export function setStoredLanguage(lang) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch (e) {
    // Δεν μπλοκάρουμε ποτέ τον χρήστη αν δεν μπορούμε να αποθηκεύσουμε -
    // η επιλογή απλά δεν θα επιμείνει σε αυτή τη συσκευή/session.
  }
}

// Λεξικό μεταφράσεων. Key = σταθερό αναγνωριστικό (namespace.key),
// value = το κείμενο. Κρατάμε flat structure (όχι nested objects) για
// απλότητα - τα namespaces είναι απλά μέρος του key string.
const translations = {
  en: {
    // --- GuestJoin (entry / "login") ---
    'guestJoin.scanTitle1': 'Scan the',
    'guestJoin.scanTitle2': 'QR code',
    'guestJoin.scanTitle3': 'of the event you want to join',
    'guestJoin.orEnterCode': 'or enter the code',
    'guestJoin.codePlaceholder': 'Event code',
    'guestJoin.joining': 'Joining...',
    'guestJoin.joinParty': 'Join Party',
    'guestJoin.cancelCamera': 'Cancel',
    'guestJoin.cameraError': "Couldn't open the camera (permission may be missing, or this device has no camera). Type the code manually below.",
    'guestJoin.keepFavoritesText': 'Want to keep your favorites and photos?',
    'guestJoin.continueWithEmail': 'Continue with email',
    'guestJoin.hostLogin': 'Host login',
    'guestJoin.languageLabel': 'Language',

    // --- Guestsignin (name entry) ---
    'guestSignIn.title': "What's your name?",
    'guestSignIn.label': 'Full name',
    'guestSignIn.subtitle': 'So the couple knows who captured each moment',
    'guestSignIn.namePlaceholder': 'e.g. John Smith',
    'guestSignIn.profanityWarning': 'Please use your real name, without inappropriate words 🙂',
    'guestSignIn.nameTakenWarning': 'There is already a guest with this name — add something to stand out (e.g. last name)',
    'guestSignIn.footnote': "The couple will know who took each moment",
    'guestSignIn.continue': 'Join Party',

    // --- HostLogin ---
    'hostLogin.back': 'Back',
    'hostLogin.title': 'Host sign in',
    'hostLogin.subtitle': 'Sign in to manage your events and venues.',

    // --- QrScanner ---
    'qrScanner.notSupported': 'Camera is not supported on this device/browser.',

    // --- TopBar ---
    'topBar.logout': 'Log out',
    'topBar.favorites': 'Favorites',
    'topBar.settings': 'Settings',
    'topBar.signIn': 'Sign in',

    // --- EventHero ---
    'eventHero.defaultTagline': 'Different moments, same celebration. All yours.',
    'eventHero.allPhotos': 'All',
    'eventHero.photoCount_one': '{{count}} photo',
    'eventHero.photoCount_other': '{{count}} photos',
    'eventHero.discountCta': '20% off for you',

    // --- PhotoGallery ---
    'photoGallery.empty': 'No photos yet',
    'photoGallery.emptySubtitle': 'Be the first to add a memory!',
    'photoGallery.loadMore': 'Load more',
    'photoGallery.loading': 'Loading...',
    'photoGallery.deleteConfirmTitle': 'Delete this photo?',
    'photoGallery.deleteConfirmBody': "This can't be undone.",
    'photoGallery.cancel': 'Cancel',
    'photoGallery.delete': 'Delete',
    'photoGallery.signInToLike': 'Sign in to like photos',
    'photoGallery.mostLiked': 'Most liked',
    'photoGallery.myPhotos': 'My photos',

    // --- PhotoLightbox ---
    'photoLightbox.deletePhoto': 'Delete photo',
    'photoLightbox.deleteVideo': 'Delete video',
    'photoLightbox.download': 'Download',
    'photoLightbox.share': 'Share',
    'photoLightbox.close': 'Close',
    'photoLightbox.deleteConfirmTitle': 'Delete this?',
    'photoLightbox.deleteConfirmBody': "This can't be undone.",
    'photoLightbox.cancel': 'Cancel',
    'photoLightbox.delete': 'Delete',

    // --- PhotoPreviewModal ---
    'photoPreview.title': 'Preview',
    'photoPreview.addMore': 'Add more',
    'photoPreview.chooseCategory': 'Choose a category',
    'photoPreview.uploading': 'Uploading...',
    'photoPreview.uploadButton': 'Upload',
    'photoPreview.cancel': 'Cancel',
    'photoPreview.remove': 'Remove',
    'photoPreview.video': 'Video',

    // --- PhotoCapture / VideoRecorder ---
    'capture.cancel': 'Cancel',
    'capture.switchCamera': 'Switch camera',
    'capture.takePhoto': 'Take photo',
    'capture.retake': 'Retake',
    'capture.use': 'Use photo',
    'capture.cameraError': "Couldn't open the camera (permission may be missing, or this device has no camera).",
    'videoRecorder.record': 'Record',
    'videoRecorder.stop': 'Stop',
    'videoRecorder.retake': 'Retake',
    'videoRecorder.use': 'Use video',
    'videoRecorder.maxDuration': 'Maximum duration reached',
    'videoRecorder.cameraError': "Couldn't open the camera (permission may be missing, or this device has no camera).",

    // --- FloatingAddMenu ---
    'addMenu.takePhoto': 'Take photo',
    'addMenu.recordVideo': 'Record video',
    'addMenu.uploadFromGallery': 'Upload from gallery',
    'addMenu.resumeDraft': 'Continue your upload',

    // --- UploadToastStack ---
    'uploadToast.justUploaded': '{{name}} just added a photo',
    'uploadToast.justUploadedVideo': '{{name}} just added a video',

    // --- AuthForm ---
    'authForm.title': 'Continue with email',
    'authForm.subtitle': 'Keep your favorites and photos across every event',
    'authForm.emailPlaceholder': 'Your email',
    'authForm.sendCode': 'Continue',
    'authForm.sending': 'Sending...',
    'authForm.codeSentTitle': 'Check your email',
    'authForm.codeSentSubtitle': 'We sent a 6-digit code to {{email}}',
    'authForm.codePlaceholder': 'Code',
    'authForm.verify': 'Verify',
    'authForm.verifying': 'Verifying...',
    'authForm.namePlaceholder': 'Your name',
    'authForm.resend': 'Resend code',
    'authForm.back': 'Back',
    'authForm.close': 'Close',

    // --- AccountSettings ---
    'accountSettings.title': 'Settings',
    'accountSettings.name': 'Name',
    'accountSettings.save': 'Save',
    'accountSettings.saving': 'Saving...',
    'accountSettings.logout': 'Log out',
    'accountSettings.close': 'Close',
    'accountSettings.favorites': 'Favorites',
    'accountSettings.language': 'Language',

    // --- MyEvents ---
    'myEvents.title': 'My events',
    'myEvents.empty': "You haven't joined any events yet",
    'myEvents.scanTab': 'Scan QR',
    'myEvents.codeTab': 'Enter code',
    'myEvents.codePlaceholder': 'Event code',
    'myEvents.join': 'Join',
    'myEvents.joining': 'Joining...',
    'myEvents.cameraError': "Couldn't open the camera (permission may be missing, or this device has no camera). Enter the code manually instead.",
    'myEvents.settings': 'Settings',

    // --- Favorites ---
    'favorites.title': 'Favorites',
    'favorites.empty': 'No favorites yet',
    'favorites.emptySubtitle': 'Like photos to find them here',
    'favorites.back': 'Back',

    // --- Generic / shared ---
    'common.error': 'Something went wrong',
    'common.retry': 'Retry',
  },
  el: {
    'guestJoin.scanTitle1': 'Σάρωσε το',
    'guestJoin.scanTitle2': 'QR code',
    'guestJoin.scanTitle3': 'του event που θέλεις να μπεις',
    'guestJoin.orEnterCode': 'ή γράψε τον κωδικό',
    'guestJoin.codePlaceholder': 'Κωδικός event',
    'guestJoin.joining': 'Joining...',
    'guestJoin.joinParty': 'Join Party',
    'guestJoin.cancelCamera': 'Ακύρωση',
    'guestJoin.cameraError': 'Δεν μπόρεσα να ανοίξω την κάμερα (ίσως δεν δόθηκε άδεια, ή η συσκευή δεν έχει κάμερα). Γράψε τον κωδικό χειροκίνητα παρακάτω.',
    'guestJoin.keepFavoritesText': 'Θες να κρατάς τα αγαπημένα σου και τις φωτογραφίες σου;',
    'guestJoin.continueWithEmail': 'Συνέχεια με email',
    'guestJoin.hostLogin': 'Σύνδεση διοργανωτή',
    'guestJoin.languageLabel': 'Γλώσσα',

    'guestSignIn.title': 'Ποιο είναι το όνομά σου;',
    'guestSignIn.label': 'Ονοματεπώνυμο',
    'guestSignIn.subtitle': 'Το ζευγάρι θα ξέρει ποιος τράβηξε κάθε στιγμή',
    'guestSignIn.namePlaceholder': 'π.χ. Γιάννης Παπαδόπουλος',
    'guestSignIn.profanityWarning': 'Χρησιμοποίησε το πραγματικό σου όνομα, χωρίς ακατάλληλες λέξεις 🙂',
    'guestSignIn.nameTakenWarning': 'Υπάρχει ήδη καλεσμένος/η με αυτό το όνομα — πρόσθεσε κάτι για να ξεχωρίζεις (π.χ. επώνυμο)',
    'guestSignIn.footnote': 'Το ζευγάρι θα ξέρει ποιος τράβηξε κάθε στιγμή',
    'guestSignIn.continue': 'Join Party',

    'hostLogin.back': 'Πίσω',
    'hostLogin.title': 'Σύνδεση Διοργανωτή',
    'hostLogin.subtitle': 'Συνδέσου για να διαχειριστείς τα events και τα venues σου.',

    'qrScanner.notSupported': 'Η κάμερα δεν υποστηρίζεται σε αυτή τη συσκευή/browser.',

    'topBar.logout': 'Αποσύνδεση',
    'topBar.favorites': 'Αγαπημένα',
    'topBar.settings': 'Ρυθμίσεις',
    'topBar.signIn': 'Σύνδεση',

    'eventHero.defaultTagline': 'Different moments, same celebration. All yours.',
    'eventHero.allPhotos': 'Όλες',
    'eventHero.photoCount_one': '{{count}} φωτογραφία',
    'eventHero.photoCount_other': '{{count}} φωτογραφίες',
    'eventHero.discountCta': '20% έκπτωση για σένα',

    'photoGallery.empty': 'Δεν υπάρχουν ακόμα φωτογραφίες',
    'photoGallery.emptySubtitle': 'Γίνε ο πρώτος που θα προσθέσει μια ανάμνηση!',
    'photoGallery.loadMore': 'Φόρτωσε περισσότερες',
    'photoGallery.loading': 'Φόρτωση...',
    'photoGallery.deleteConfirmTitle': 'Διαγραφή αυτής της φωτογραφίας;',
    'photoGallery.deleteConfirmBody': 'Δεν μπορεί να αναιρεθεί.',
    'photoGallery.cancel': 'Ακύρωση',
    'photoGallery.delete': 'Διαγραφή',
    'photoGallery.signInToLike': 'Συνδέσου για να κάνεις like στις φωτογραφίες',
    'photoGallery.mostLiked': 'Με τα περισσότερα likes',
    'photoGallery.myPhotos': 'Οι φωτογραφίες μου',

    'photoLightbox.deletePhoto': 'Διαγραφή φωτογραφίας',
    'photoLightbox.deleteVideo': 'Διαγραφή βίντεο',
    'photoLightbox.download': 'Λήψη',
    'photoLightbox.share': 'Κοινοποίηση',
    'photoLightbox.close': 'Κλείσιμο',
    'photoLightbox.deleteConfirmTitle': 'Διαγραφή;',
    'photoLightbox.deleteConfirmBody': 'Δεν μπορεί να αναιρεθεί.',
    'photoLightbox.cancel': 'Ακύρωση',
    'photoLightbox.delete': 'Διαγραφή',

    'photoPreview.title': 'Προεπισκόπηση',
    'photoPreview.addMore': 'Πρόσθεσε κι άλλες',
    'photoPreview.chooseCategory': 'Διάλεξε κατηγορία',
    'photoPreview.uploading': 'Ανεβαίνουν...',
    'photoPreview.uploadButton': 'Ανέβασμα',
    'photoPreview.cancel': 'Ακύρωση',
    'photoPreview.remove': 'Αφαίρεση',
    'photoPreview.video': 'Βίντεο',

    'capture.cancel': 'Ακύρωση',
    'capture.switchCamera': 'Αλλαγή κάμερας',
    'capture.takePhoto': 'Λήψη φωτογραφίας',
    'capture.retake': 'Ξανά',
    'capture.use': 'Χρήση φωτογραφίας',
    'capture.cameraError': 'Δεν μπόρεσα να ανοίξω την κάμερα (ίσως δεν δόθηκε άδεια, ή η συσκευή δεν έχει κάμερα).',
    'videoRecorder.record': 'Εγγραφή',
    'videoRecorder.stop': 'Διακοπή',
    'videoRecorder.retake': 'Ξανά',
    'videoRecorder.use': 'Χρήση βίντεο',
    'videoRecorder.maxDuration': 'Φτάσαμε στη μέγιστη διάρκεια',
    'videoRecorder.cameraError': 'Δεν μπόρεσα να ανοίξω την κάμερα (ίσως δεν δόθηκε άδεια, ή η συσκευή δεν έχει κάμερα).',

    'addMenu.takePhoto': 'Λήψη φωτογραφίας',
    'addMenu.recordVideo': 'Εγγραφή βίντεο',
    'addMenu.uploadFromGallery': 'Ανέβασμα από τη συλλογή',
    'addMenu.resumeDraft': 'Συνέχισε το ανέβασμά σου',

    'uploadToast.justUploaded': 'Ο/Η {{name}} μόλις πρόσθεσε μια φωτογραφία',
    'uploadToast.justUploadedVideo': 'Ο/Η {{name}} μόλις πρόσθεσε ένα βίντεο',

    'authForm.title': 'Συνέχεια με email',
    'authForm.subtitle': 'Κράτα τα αγαπημένα και τις φωτογραφίες σου σε κάθε event',
    'authForm.emailPlaceholder': 'Το email σου',
    'authForm.sendCode': 'Συνέχεια',
    'authForm.sending': 'Αποστολή...',
    'authForm.codeSentTitle': 'Έλεγξε το email σου',
    'authForm.codeSentSubtitle': 'Στείλαμε έναν 6ψήφιο κωδικό στο {{email}}',
    'authForm.codePlaceholder': 'Κωδικός',
    'authForm.verify': 'Επιβεβαίωση',
    'authForm.verifying': 'Επιβεβαίωση...',
    'authForm.namePlaceholder': 'Το όνομά σου',
    'authForm.resend': 'Επαναποστολή κωδικού',
    'authForm.back': 'Πίσω',
    'authForm.close': 'Κλείσιμο',

    'accountSettings.title': 'Ρυθμίσεις',
    'accountSettings.name': 'Όνομα',
    'accountSettings.save': 'Αποθήκευση',
    'accountSettings.saving': 'Αποθήκευση...',
    'accountSettings.logout': 'Αποσύνδεση',
    'accountSettings.close': 'Κλείσιμο',
    'accountSettings.favorites': 'Αγαπημένα',
    'accountSettings.language': 'Γλώσσα',

    'myEvents.title': 'Τα events μου',
    'myEvents.empty': 'Δεν έχεις μπει ακόμα σε κανένα event',
    'myEvents.scanTab': 'Σάρωση QR',
    'myEvents.codeTab': 'Κωδικός',
    'myEvents.codePlaceholder': 'Κωδικός event',
    'myEvents.join': 'Είσοδος',
    'myEvents.joining': 'Είσοδος...',
    'myEvents.cameraError': 'Δεν μπόρεσα να ανοίξω την κάμερα (ίσως δεν δόθηκε άδεια, ή η συσκευή δεν έχει κάμερα). Γράψε τον κωδικό χειροκίνητα.',
    'myEvents.settings': 'Ρυθμίσεις',

    'favorites.title': 'Αγαπημένα',
    'favorites.empty': 'Δεν υπάρχουν ακόμα αγαπημένα',
    'favorites.emptySubtitle': 'Κάνε like σε φωτογραφίες για να τις βρεις εδώ',
    'favorites.back': 'Πίσω',

    'common.error': 'Κάτι πήγε στραβά',
    'common.retry': 'Ξαναδοκίμασε',
  },
};

const LanguageContext = createContext({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  t: (key) => key,
});

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(getStoredLanguage);

  const setLanguage = useCallback((lang) => {
    if (lang !== 'en' && lang !== 'el') return;
    setLanguageState(lang);
    setStoredLanguage(lang);
  }, []);

  // t(key, vars?) - vars κάνει simple {{placeholder}} interpolation (π.χ.
  // {{name}}, {{email}}, {{count}}). Για πληθυντικό χρησιμοποιούμε απλά
  // _one/_other suffix στο key (δες tCount παρακάτω) - δεν χρειαζόμαστε
  // πλήρη ICU πολυπλοκότητα για 2 γλώσσες.
  const t = useCallback((key, vars) => {
    const dict = translations[language] || translations[DEFAULT_LANGUAGE];
    let str = dict[key] ?? translations[DEFAULT_LANGUAGE][key] ?? key;
    if (vars) {
      Object.keys(vars).forEach((k) => {
        str = str.replace(new RegExp(`{{${k}}}`, 'g'), String(vars[k]));
      });
    }
    return str;
  }, [language]);

  // Βοηθητικό για απλό πληθυντικό (0/1 vs 2+) - en: "1 photo" / "2 photos",
  // el: "1 φωτογραφία" / "2 φωτογραφίες".
  const tCount = useCallback((baseKey, count) => {
    const suffix = count === 1 ? '_one' : '_other';
    return t(`${baseKey}${suffix}`, { count });
  }, [t]);

  useEffect(() => {
    try {
      document.documentElement.lang = language;
    } catch (e) {}
  }, [language]);

  return React.createElement(
    LanguageContext.Provider,
    { value: { language, setLanguage, t, tCount } },
    children
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}