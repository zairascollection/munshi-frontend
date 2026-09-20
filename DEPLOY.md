# Deploy checklist — Munshi v2

Zaroori: naye features tab tak nazar nahi ayenge jab tak dono cheezein
dobara deploy na hon. Code mein sab kuch hai — sirf deploy chahiye.

## 1. Backend (Railway)

1. `munshi-backend-final/` ka poora folder apne repo mein replace karein.
2. Push karein — Railway khud rebuild kar lega.
3. Deploy Logs mein ye line dhoondein:

   ```
   Schema migration applied.
   ```

   Ye confirm karta hai ke naye columns aur tables ban gaye
   (`ad_spend`, `settings`, `monthly_reports`, orders ke naye columns).

4. **Cron job** add karein (month-end sheet khud banne ke liye):
   - Railway → New → Cron Job
   - Command / URL: `GET https://<backend-domain>/reports/month-end/cron?secret=<ALERTS_CRON_SECRET>`
   - Schedule: `5 0 1 * *`

## 2. Frontend (Vercel)

1. `munshi-frontend/` folder replace karein, push karein.
2. Vercel par **Redeploy** — aur zaroori: *"Use existing build cache"* ko
   **uncheck** karein, warna purana bundle serve hota rehta hai.
3. Browser mein hard refresh: `Ctrl + Shift + R` (mobile par app close karke
   dobara kholein).

## 3. Check karein ke sab aa gaya

Owner se login karke sidebar mein ye 5 naye items nazar aane chahiye:

- **Returns** (Daily kaam section)
- **Profit tracker** (Paisa section)
- **Monthly sheet**
- **Ad spend**
- **Cost settings** + **Change history** (Log & settings section)

Aur:
- Orders → *Add order* form mein **Billed by** field (aapka naam pehle se bhara hua)
- Inventory table mein **Real cost**, **Margin**, **Stock value** columns
- Har order row par **Return** button

## 4. Pehla setup (2 minute)

1. **Cost settings** kholein → delivery charge, return charge, packaging,
   cash handling % bharein. In ke bagair profit numbers adhoore rahenge.
2. **Ad spend** mein is mahine ka Facebook/Instagram kharcha daalein →
   Profit tracker mein asli ROAS aa jayega.
3. **Team** mein manager login banayein: role dropdown se `manager` chunein.


---

# v3 — naye modules

## Frontend
`src/App.jsx` aur `src/api.js` replace karein (wahi tareeqa — GitHub par
`src` folder ke andar upload).

## Backend
`src/` folder poora replace karein. Nayi files:

```
src/routes/purchases.js     (NEW)
src/routes/customers.js     (NEW)
src/routes/whatsapp.js      (NEW)
src/services/whatsapp.js    (NEW)
src/routes/resources.js     (updated - suppliers + variants + stock push)
src/services/woocommerce.js (updated - stock push to website)
src/utils/crudRouter.js     (updated)
src/utils/permissions.js    (updated)
src/db/schema.sql           (updated)
src/server.js               (updated)
```

Deploy Logs mein `Schema migration applied.` phir se aana chahiye.

## Naye env vars (Railway -> Variables)

```
WHATSAPP_TOKEN=
WHATSAPP_PHONE_ID=
WHATSAPP_VERIFY_TOKEN=          (koi bhi apni marzi ka string)
OWNER_WHATSAPP=923001234567
```

In ke bagair baqi sab kaam karta rahega — sirf WhatsApp wale buttons
"not configured" kahenge.

## Cron jobs (Railway -> New -> Cron Job)

```
GET /reports/month-end/cron?secret=<ALERTS_CRON_SECRET>   ->  5 0 1 * *
GET /alerts/digest/cron?secret=<ALERTS_CRON_SECRET>       ->  0 4 * * *
```

## Pehla setup

1. **Suppliers** mein apne 2-3 supplier add karein.
2. **Purchases** -> New PO -> items daalein -> maal aane par **Receive**.
   Yahi se stock aur real cost dono set hongi.
3. **Inventory** mein purane items ko "Design / group name" + Size + Colour
   de dein taake variants group ho jayein.
4. **Cost settings -> Integrations** mein teeno dot green hone chahiyen.
5. **Customers** tab kholein — jo log 2+ parcel return kar chuke hain wo
   khud "Risky" mark honge. Jinko COD nahi bhejna, unhein Block COD karein.

---

# Speed + PWA update

## Kya badla

- recharts (chart library) ab alag file mein — pehli load 193 KB se 83 KB par
- App inventory + orders aate hi khul jata hai, baqi peeche load hota hai
- Inventory ki tasveerein ab list ke saath nahi aatin — alag URL se aati hain
  aur browser unhein ek saal cache karta hai. Doosri load par 0 bytes.
- Save ab sirf badla hua field bhejta hai (pehle poora record + tasveer)
- Har state change par poori list ko JSON.stringify karna band — yehi UI ko
  sust kar raha tha
- PWA: home screen icon, full screen, service worker

## Deploy

**Backend zaroori hai** — bina uske tasveerein nazar nahi ayengi
(list ab `image_url` bhejti hai jo purane backend mein hai hi nahi).

1. Backend: `src` folder replace → deploy → `Schema migration applied.` check
2. Frontend: `src/`, `public/`, `index.html`, `vite.config.js` — chaaron upload
3. Vercel Redeploy, build cache ka tick hata kar

Backend PEHLE. Ulta kiya to thori der tasveerein ghayab rahengi.

## Deploy ke baad

Service worker purani copy chala sakta hai. App band kar ke dobara kholein —
doosri baar naya version aa jayega.

---

# v5 — Stock diya hua + Sold by

## Naya kya hai

**Stock diya hua** (naya tab, sidebar mein "Stock aana / jana" ke neeche)
- Affiliate ya kisi bhi banday ko maal dein — inventory se khud kam ho jata hai
- Jitna stock maujood nahi, utna diya hi nahi ja sakta
- "Hisab" button: kitna wapas aya, kitna bika — wapas aya hua maal khud
  inventory mein add ho jata hai
- Kis ke paas kitna maal hai, uski alag list

**Sold by** — har order par
- POS aur Orders dono mein "Sold by" ka option (staff, affiliate, ya naam likhein)
- Orders table mein Sold by column + affiliate ka badge
- Orders ke upar seller filter — "is banday ne kya kya becha"
- Customer ka phone ab seedha Orders table mein
- Profit tracker aur monthly sheet mein seller-wise sale

## Deploy — backend PEHLE

Backend ke bagair "Stock diya hua" tab error dega (nayi tables hain).

1. Backend: `src` folder replace → deploy → Deploy Logs mein
   `Schema migration applied.` check karein
2. Frontend: `src/` folder replace
3. Vercel Redeploy, build cache ka tick hata kar

## Pehla istemal

1. **Stock diya hua** → "Stock issue karein" → affiliate chunein, items daalein
2. Jab woh wapas aaye → us consignment par **Hisab** → wapas aya / bika likhein
3. Jo bika, us ki sale POS se alag record karein aur **Sold by** mein usi
   affiliate ka naam chunein — tab profit tracker mein uski sale nazar ayegi

---

# Backup

## Teen layer — teeno lagayein

**1. Railway ka apna backup (sab se ahem, code ki zarurat nahi)**

Railway → apna **Postgres** service (backend nahi) → **Backups** tab →
on kar dein. Yehi woh cheez hai jo tab kaam aati hai jab poora service
hi kho jaye. Daily backup set kar dein.

**2. App se download (ye aap ke haath mein rehta hai)**

App → Cost settings → **Backup** → *Backup download karein*.
File apne phone ya Google Drive mein rakh lein.

Sirf server par backup honay ka koi faida nahi — agar hosting account
hi chala gaya to backup bhi usi ke sath jayega. Is liye file apne paas
rakhna zaroori hai.

Teen option hain:
- **Backup download karein** — sab kuch, tasveeron samet (ye asli backup hai)
- **Chhota backup** — bina tasveeron ke, WhatsApp par bhejne layak
- **Excel ke liye CSV** — padhne ke liye, restore ke liye nahi

**3. Hafte-war reminder**

Railway → New → Cron Job:
```
GET https://api.zairascollection.com/backup/cron?secret=<ALERTS_CRON_SECRET>
schedule: 0 4 * * 5
```
Har Jumma subah 9 baje WhatsApp par yaad dehani aa jayegi.

## Restore kaise karein

Cost settings → Backup → Restore → file chunein → **RESTORE** likhein →
Restore karein.

Purana data delete nahi hota. Jo record file mein hain woh add ya update
ho jate hain, baqi waise ke waise rehte hain — is liye ghalti se chal
jaye to nuqsan nahi hota.

Ek baat: **passwords backup mein nahi jate.** Restore ke baad Team tab se
har login ka password dobara set karna hoga.

## Mera mashwara

Mahine mein ek baar download kar ke Drive mein rakh dein. Railway ka
backup roz chalta rahe. Bas itna kaafi hai.
