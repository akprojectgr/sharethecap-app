# 🚀 Deployment Guide - Βάλε το Klev Online!

## Option 1: Vercel (Συνιστάται - Πιο εύκολο)

### Βήμα 1: Build το project
```bash
npm run build
```

### Βήμα 2: Deploy
```bash
# Εγκατάσταση Vercel CLI
npm install -g vercel

# Deploy
vercel
```

Ακολούθησε τις οδηγίες στην οθόνη. Θα σου δώσει ένα URL τύπου: `https://klev.vercel.app`

---

## Option 2: Netlify

### Με Netlify CLI:
```bash
# Build
npm run build

# Εγκατάσταση Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy --prod --dir=dist
```

### Με Web Interface:
1. Πήγαινε στο https://netlify.com
2. Σύρε το φάκελο `dist/` στη σελίδα
3. Παίρνεις ένα URL!

---

## Option 3: GitHub Pages (Free)

1. Πρόσθεσε στο `vite.config.js`:
```javascript
export default defineConfig({
  plugins: [react()],
  base: '/klev/', // Αν το repo λέγεται "klev"
});
```

2. Build και deploy:
```bash
npm run build
cd dist
git init
git add .
git commit -m "Deploy"
git push -f git@github.com:USERNAME/klev.git main:gh-pages
```

---

## ⚠️ ΠΡΟΣΟΧΗ πριν το deploy:

### 1. Βάλε Environment Variables

**ΜΠΟΡΕΙΣ** να βάλεις τα Supabase credentials σε `.env` file:

Δημιούργησε `.env.local`:
```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Και στο `src/App.jsx` άλλαξε:
```javascript
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
```

Στην πλατφόρμα deployment (Vercel/Netlify):
- Πρόσθεσε τα environment variables στις ρυθμίσεις

### 2. Custom Domain (Προαιρετικό)

Αν έχεις domain (π.χ. klev.gr):
- Vercel: Settings → Domains → Add
- Netlify: Domain Settings → Add custom domain

---

## 📱 PWA (Progressive Web App) - Προαιρετικό

Για να μπορούν οι χρήστες να το "εγκαταστήσουν" στο κινητό:

1. Εγκατάσταση:
```bash
npm install vite-plugin-pwa -D
```

2. Πρόσθεσε στο `vite.config.js`:
```javascript
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Klev',
        short_name: 'Klev',
        theme_color: '#1A2238',
        icons: [
          {
            src: '/logo.png',
            sizes: '192x192',
            type: 'image/png'
          }
        ]
      }
    })
  ]
});
```

---

## 🔒 Security Best Practices

### 1. Environment Variables
Μην κάνε commit το `.env.local` στο Git!

Το `.gitignore` ήδη το έχει, αλλά double-check:
```
.env
.env.local
.env.production
```

### 2. Supabase RLS (Row Level Security)
Τα policies που έτρεξες στο SQL είναι ασφαλή:
- Όλοι μπορούν να βλέπουν μόνο το event τους
- Όλοι μπορούν να ανεβάζουν φωτό
- Κανείς δεν μπορεί να διαγράψει φωτό άλλων

### 3. Admin Panel Protection
Το Admin Panel **δεν** πρέπει να είναι δημόσιο!

**Επιλογές:**
- Deploy το admin σε ξεχωριστό subdomain (admin.klev.gr)
- Πρόσθεσε password protection
- Κάνε το access μόνο από το local development

---

## ✅ Checklist πριν το deployment:

- [ ] Έβαλες τα Supabase credentials
- [ ] Έτρεξες `npm run build` χωρίς errors
- [ ] Δοκίμασες το app locally με `npm run dev`
- [ ] Πρόσθεσες το logo.png στο `public/`
- [ ] Έφτιαξες τουλάχιστον 1 test event
- [ ] Δοκίμασες upload φωτογραφίας
- [ ] Έβαλες environment variables στην πλατφόρμα

---

Καλή επιτυχία! 🎉

Αν χρειαστείς βοήθεια με κάποιο βήμα, ρώτα!
