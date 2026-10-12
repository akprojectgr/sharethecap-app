// Cloudflare Pages Function - τρέχει στο edge ΠΡΙΝ σερβιριστεί το static
// SPA (dist/index.html). ΣΤΟΧΟΣ: όταν κάποιος στέλνει ένα event link
// (π.χ. https://app.sharethecap.com/?code=TEST11507) στο Messenger/
// Facebook/WhatsApp κλπ, το bot εκείνης της υπηρεσίας ΔΕΝ τρέχει καθόλου
// JavaScript - διαβάζει μόνο το στατικό HTML που παίρνει. Το React app μας
// είναι SPA, οπότε ΧΩΡΙΣ αυτό το function, κάθε link (ανεξάρτητα από event)
// θα έδειχνε το ίδιο γενικό/άδειο index.html.
//
// Λύση: αναγνωρίζουμε πότε ο επισκέπτης είναι ένα από αυτά τα bots (όχι
// πραγματικός χρήστης) και ΜΟΝΟ τότε επιστρέφουμε ένα μικρό, στατικό HTML
// με σωστά Open Graph meta tags γεμάτα με τα ΠΡΑΓΜΑΤΙΚΑ στοιχεία του event
// (όνομα ζευγαριού/event, banner φωτογραφία) - διαβασμένα ζωντανά από το
// Supabase. Πραγματικοί χρήστες/browsers περνάνε ΑΝΕΠΗΡΕΑΣΤΟΙ μέσα από το
// context.next() και βλέπουν το κανονικό React app όπως πάντα.
//
// ΠΡΟΣΟΧΗ αν αλλάξει ποτέ το project του Supabase: ενημέρωσε τα δύο
// παρακάτω σταθερά (SUPABASE_URL/SUPABASE_ANON_KEY) - είναι ΤΑ ΙΔΙΑ public
// στοιχεία που ήδη υπάρχουν μέσα στο src/lib/supabaseClient.js (ο anon key
// δεν είναι μυστικός, είναι ήδη ορατός σε κάθε browser που ανοίγει το app).
const SUPABASE_URL = 'https://jxfaoxcasdqjrbdqeoan.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4ZmFveGNhc2RxanJiZHFlb2FuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1ODUyNjgsImV4cCI6MjEwNDE2MTI2OH0.rcVYeet2n2AsLWRaMI4E2W_0r9NqDlTsT4ehi0M3N9k';

// Γνωστά link-preview bots (Facebook/Messenger, WhatsApp, Telegram, Slack,
// Twitter/X, LinkedIn, Discord, Viber δεν στέλνει δικό του bot - χρησιμοποιεί
// τα ίδια tags μέσω άλλου καναλιού). Ό,τι ΔΕΝ ταιριάζει εδώ θεωρείται
// κανονικός χρήστης και περνάει ανεπηρέαστος.
const BOT_UA_REGEX =
  /facebookexternalhit|Facebot|Twitterbot|Slackbot|TelegramBot|WhatsApp|LinkedInBot|Discordbot|redditbot|Pinterest|vkShare|SkypeUriPreview|Applebot|W3C_Validator|Viber/i;

const DEFAULT_TITLE = 'ShareTheCap';
const DEFAULT_DESCRIPTION =
  'Μοιράσου φωτογραφίες & βίντεο ζωντανά από το event σου.';
// Αυτό το αρχείο πρέπει να υπάρχει στο public/og-default.png (βλ. σχόλιο
// στο τέλος του αρχείου) - σερβίρεται στατικά από το ίδιο site.
const DEFAULT_IMAGE_PATH = '/og-default.png';

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function isLikelyPageRequest(request, pathname) {
  // Μην "τυλίγεις" αιτήματα για πραγματικά αρχεία (JS/CSS/εικόνες/manifest
  // κλπ) - μόνο αιτήματα για ΣΕΛΙΔΕΣ (χωρίς κατάληξη αρχείου).
  //
  // ΣΗΜΑΝΤΙΚΟ (bug που διορθώθηκε): ΔΕΝ ελέγχουμε πλέον το header
  // "Accept" - πολλά πραγματικά link-preview bots (π.χ. το πραγματικό
  // facebookexternalhit, ή απλά εργαλεία σαν curl) στέλνουν
  // "Accept: */*" αντί για "text/html", οπότε ο παλιός έλεγχος τα
  // απέρριπτε ΟΛΑ σιωπηλά πριν καν φτάσουμε στον έλεγχο User-Agent -
  // αυτός ήταν ο λόγος που το personalized preview δεν εμφανιζόταν ΠΟΤΕ,
  // ακόμα και για το πραγματικό Facebook crawler. Ο έλεγχος User-Agent
  // (BOT_UA_REGEX) παρακάτω αρκεί από μόνος του για να ξεχωρίσει bots
  // από πραγματικούς χρήστες.
  return !/\.[a-zA-Z0-9]+$/.test(pathname);
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  if (request.method !== 'GET' || !isLikelyPageRequest(request, url.pathname)) {
    return context.next();
  }

  const userAgent = request.headers.get('user-agent') || '';
  const isBot = BOT_UA_REGEX.test(userAgent);

  if (!isBot) {
    // Κανονικός επισκέπτης - σερβίρισμα του React SPA όπως πάντα, καμία
    // αλλαγή στη ροή του.
    return context.next();
  }

  const code = url.searchParams.get('code');

  let title = DEFAULT_TITLE;
  let description = DEFAULT_DESCRIPTION;
  let image = new URL(DEFAULT_IMAGE_PATH, url.origin).toString();

  if (code) {
    try {
      const apiUrl =
        `${SUPABASE_URL}/rest/v1/events` +
        `?event_code=eq.${encodeURIComponent(code)}` +
        `&select=event_name,couple_names,tagline,banner_url,event_category,is_active` +
        `&limit=1`;
      // ΔΙΟΡΘΩΣΗ (code review - "χωρίς timeout εδώ"): το try/catch πιάνει
      // μόνο REJECTIONS (π.χ. network error) - αν το Supabase απλά ΚΟΛΛΗΣΕΙ
      // (π.χ. υπερφόρτωση τη στιγμή που 100+ καλεσμένοι ανεβάζουν μαζικά τη
      // βραδιά του γάμου), το fetch απλά περιμένει - και το Cloudflare
      // Pages Function έχει δικό του όριο εκτέλεσης, οπότε ένα πολύ αργό
      // Supabase θα μπορούσε να κάνει ΑΥΤΟ το request (ένα bot link-preview
      // request) να λήξει με σφάλμα αντί να πέσει ήσυχα στα defaults.
      // AbortController με ρητό όριο 3 δευτ. διασφαλίζει ότι πάντα θα
      // προλάβουμε να απαντήσουμε με κάτι λογικό.
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 3000);
      let res;
      try {
        res = await fetch(apiUrl, {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          signal: abortController.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      if (res.ok) {
        const rows = await res.json();
        const ev = rows && rows[0];
        if (ev) {
          if (ev.event_category === 'wedding' && ev.couple_names) {
            title = `${ev.couple_names} 💍 ShareTheCap`;
          } else if (ev.event_name) {
            title = `${ev.event_name} — ShareTheCap`;
          }
          description = ev.tagline || DEFAULT_DESCRIPTION;
          // og:image ΠΡΕΠΕΙ να είναι απόλυτο URL - αν το banner_url δεν
          // είναι (ή λείπει), μένουμε στην default εικόνα branding.
          if (typeof ev.banner_url === 'string' && /^https?:\/\//i.test(ev.banner_url)) {
            image = ev.banner_url;
          }
        }
      }
    } catch (err) {
      // Σιωπηλή αποτυχία (π.χ. Supabase προσωρινά κάτω) - πέφτουμε στα
      // γενικά ShareTheCap defaults παραπάνω, ΠΟΤΕ δεν σπάει το preview.
    }
  }

  const pageUrl = url.toString();
  const html = `<!doctype html>
<html lang="el">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
<meta property="og:type" content="website" />
<meta property="og:site_name" content="ShareTheCap" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:url" content="${escapeHtml(pageUrl)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)}" />
<meta name="twitter:description" content="${escapeHtml(description)}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
</head>
<body>
<a href="${escapeHtml(pageUrl)}">${escapeHtml(title)}</a>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

// ΣΗΜΑΝΤΙΚΟ deployment note:
// 1) Αυτό το αρχείο πρέπει να μπει στο klev-app ΣΤΟ ΙΔΙΟ επίπεδο με τον
//    φάκελο src/ (δηλ. klev-app/functions/_middleware.js) - ΟΧΙ μέσα στο
//    dist/. Το wrangler pages deploy το ανακαλύπτει αυτόματα όταν τρέχεις
//    `npx wrangler pages deploy dist --project-name=klevapp` από τη ρίζα
//    του klev-app.
// 2) Βάλε το og-default.png (σου το έστειλα ξεχωριστά) μέσα στο
//    klev-app/public/og-default.png - το Vite το αντιγράφει αυτόματα στο
//    dist/ κατά το build, ώστε να είναι διαθέσιμο στο
//    https://app.sharethecap.com/og-default.png μετά το deploy.