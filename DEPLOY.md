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
