# 🎉 Klev - Event Photo Sharing App

## 📋 Τι έχεις ήδη κάνει:
✅ Δημιούργησες Supabase project
✅ Έτρεξες το SQL για database setup

## 🚀 Επόμενα Βήματα:

### 1. Εγκατάσταση Dependencies

Άνοιξε terminal στον φάκελο του project και τρέξε:

```bash
npm install
```

### 2. Ρύθμιση Supabase Credentials

Άνοιξε το αρχείο `src/App.jsx` και **γραμμή 5-6** βάλε τα credentials σου:

```javascript
const supabaseUrl = 'YOUR_SUPABASE_URL'; // Βάλε το Project URL σου
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY'; // Βάλε το anon key σου
```

Βρες τα στο Supabase Dashboard → Settings → API

### 3. Προσθήκη Logo

Βάλε το `logo.png` στον φάκελο `public/`:
```
klev/
├── public/
│   └── logo.png  <-- ΕΔΩ
├── src/
└── ...
```

### 4. Εκκίνηση της εφαρμογής

```bash
npm run dev
```

Θα ανοίξει στο http://localhost:3000

---

## 🎯 Πώς να δημιουργήσεις Event Codes

Για να προσθέσεις ένα νέο event (π.χ. γάμο), πήγαινε στο Supabase Dashboard:

**SQL Editor → Νέο Query → Τρέξε:**

```sql
INSERT INTO events (event_code, event_name) 
VALUES ('GAMOS2026', 'Γάμος Μαρίας & Γιάννη 2026');
```

Τώρα οι καλεσμένοι μπορούν να μπουν με κωδικό: **GAMOS2026**

### Παραδείγματα Events:

```sql
-- Γάμος 1
INSERT INTO events (event_code, event_name) 
VALUES ('WEDDING123', 'Γάμος Ιωάννα & Νίκος');

-- Βάπτιση
INSERT INTO events (event_code, event_name) 
VALUES ('BAPTISM456', 'Βάπτιση μικρού Δημήτρη');

-- Party
INSERT INTO events (event_code, event_name) 
VALUES ('PARTY789', 'Birthday Party 2026');
```

---

## ✨ Features που έχει το App:

✅ **Event Code Login** - Κάθε event έχει δικό του code
✅ **Photo Upload** - 100% ποιότητα, χωρίς συμπίεση
✅ **Real-time Gallery** - Νέες φωτό εμφανίζονται αυτόματα σε όλους
✅ **Mobile Optimized** - Λειτουργεί τέλεια σε κινητά
✅ **Responsive Design** - Instagram-style grid
✅ **Dark Theme** - #1A2238 background
✅ **Logo Support** - Το logo σου στο login screen

---

## 🔒 Ασφάλεια:

- Κάθε event έχει ξεχωριστό gallery
- Μόνο όσοι έχουν τον code μπορούν να δουν τις φωτό
- Οι φωτό αποθηκεύονται με την αρχική τους ποιότητα
- Public storage για γρήγορη πρόσβαση

---

## 📱 Deploy στο Internet:

Όταν είσαι έτοιμος να το βάλεις online:

### Option 1: Vercel (Recommended)
```bash
npm install -g vercel
vercel
```

### Option 2: Netlify
```bash
npm run build
# Upload το φάκελο dist/ στο Netlify
```

---

## 🆘 Troubleshooting:

### "Failed to fetch" error:
- Έλεγξε αν έβαλες τα σωστά Supabase credentials
- Έλεγξε αν έτρεξες το SQL setup

### Οι φωτό δεν ανεβαίνουν:
- Έλεγξε το Storage bucket στο Supabase (πρέπει να λέγεται "photos")
- Έλεγξε τα policies στο SQL

### "Λάθος κωδικός event":
- Κάνε INSERT ένα event στη βάση (δες παραπάνω)
- Ο κωδικός είναι case-sensitive (γίνεται uppercase αυτόματα)

---

## 💡 Tips:

1. **Για production**: Βάλε τα Supabase credentials σε `.env` file
2. **Για analytics**: Πρόσθεσε Google Analytics
3. **Για SEO**: Άλλαξε το `<title>` και meta tags

---

Καλή επιτυχία με το Klev! 🎉
