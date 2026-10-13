import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Το manifest το γράφουμε εμείς χειροκίνητα στο public/manifest.json
      // (ήδη linked στο index.html) - εδώ το plugin ασχολείται ΜΟΝΟ με το
      // service worker (caching/offline), δεν παράγει δικό του manifest.
      manifest: false,
      includeAssets: ['favicon.svg', 'icons/*.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Το κύριο JS bundle σου είναι ~2.24MB, πάνω από το default όριο
        // (2MB) του workbox για precaching - το ανεβάζουμε στα 5MB ώστε να
        // μπει κανονικά στο cache. (Το ίδιο το bundle size είναι ξεχωριστό
        // θέμα - βλ. σημείωση παρακάτω για code-splitting.)
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Ποτέ μην κάνεις cache requests προς το Supabase - θέλουμε πάντα
        // φρέσκα δεδομένα (νέες φωτογραφίες, likes, guests), όχι παλιά
        // cached απαντήσεις.
        // ΔΙΟΡΘΩΣΗ ("/r/<code> redirect δεν δούλευε ποτέ, σκάει στο React
        // Router"): το service worker (navigateFallback) απαντούσε ΑΜΕΣΩΣ με
        // το cached index.html σε ΚΑΘΕ navigation - ακόμα και σε
        // /r/<code>, χωρίς να φτάσει καν το request στο δίκτυο/server. Έτσι
        // το Cloudflare Pages Function στο functions/r/[code].js δεν
        // προλάβαινε ΠΟΤΕ να τρέξει· ο browser "απαντούσε μόνος του" με το
        // παλιό SPA πριν καν σταλεί το αίτημα. Προσθέτοντας το /^\/r\// εδώ,
        // αυτά τα requests παρακάμπτουν το service worker fallback και
        // πηγαίνουν κανονικά στο δίκτυο, όπου τα πιάνει το Function.
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//, /^\/storage\//, /^\/realtime\//, /^\/r\//]
      }
    })
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',  // Επιτρέπει πρόσβαση από άλλες συσκευές στο ίδιο WiFi
    open: true
  }
});