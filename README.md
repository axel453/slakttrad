# Nilsson/Bengtsson släktträd

En interaktiv släktträdssida för Nilsson/Bengtsson-släkten, byggd för att samla personkort, gårdshistorik, platser, kartkopplingar och löpande forskningsnoteringar.

## Filer

- `index.html` – sidan som visas i webbläsaren
- `app.js` – interaktion, sök, personrutor, karta och zoom
- `data.js` – personer, relationer, platser och direktlinjer
- `slaktgrenar/` – arbetsmarkdown uppdelad på mammas sida och pappas sida
- `vercel.json` – gör att rena URL:er som `/personer/.../` och `/gardar/.../` fungerar på Vercel
- `sitemap.xml` och `robots.txt` – grund för indexering i sökmotorer
- `scripts/generate-sitemap.mjs` – bygger statiska HTML-sidor och sitemap när personer och gårdar ändras
- `personer/`, `gardar/` och `personarkiv/` – förhandsrenderade sidor som kan läsas direkt av sökmotorer
- `admin/` – skyddat Familjearkiv för personer, gårdar, ändringar och användare

## Arkivsidor och administration

Person- och gårdssidorna har separata avsnitt för berättelse, tidslinje, relationer, bilder, källor och osäkerheter. Personarkivet kan filtreras på söktext, århundrade, plats, släktled och bevisstatus. Gårdsarkivet kan filtreras på söktext, typ och kartstatus.

Den publika webbplatsen är en ren läsvy. Redigering sker i Familjearkivet på `/admin/`, där Supabase-inloggning och databasens RLS-regler styr åtkomsten.

- `contributor` kan skapa ändringsförslag som skickas för granskning.
- `editor` kan redigera, granska och publicera personer och platser.
- `admin` kan dessutom hantera familjemedlemmarnas roller.

Adminadresser som `/admin/personer/` och `/admin/gardar/` skrivs om till adminappen av Vercel utan att URL:en ändras. Administrationsdelen har `noindex` och är även blockerad i `robots.txt`.

## Publicering

Det här är en statisk sida. På Vercel ska projektet publiceras utan build command och med denna mapp som projektets root.

Kör generatorn igen efter ändringar i grunddatan. Den skapar en HTML-sida för varje person och gård samt uppdaterar sitemap. Sätt `SITE_URL` till den riktiga domänen om sidan flyttas från Vercels standardadress.
## Gemensam databas

Webbplatsen använder Supabase för inloggning, gemensamma poster, roller och ändringshistorik. `data.js` ligger kvar som publicerbar grunddata och reserv för den publika läsvyn.

1. Skapa ett Supabase-projekt.
2. Öppna SQL Editor och kör `supabase/migrations/001_family_archive.sql`.
3. Skapa den aktuella importfilen:

   ```bash
   node scripts/export-supabase-seed.mjs
   ```

   Kommandot skapar även `supabase/seed.sql`. Det säkraste manuella alternativet är att öppna filen, klistra in den i Supabase SQL Editor och köra den efter migreringen. Då behöver ingen hemlig nyckel lämna Supabase.

4. Importera grunddata från en betrodd dator. `SUPABASE_SERVICE_ROLE_KEY` får aldrig läggas i webbplatsen eller Git:

   ```bash
   SUPABASE_URL="https://PROJECT.supabase.co" \
   SUPABASE_SERVICE_ROLE_KEY="SERVICE_ROLE_KEY" \
   node scripts/import-supabase.mjs
   ```

5. Fyll i projektets URL och **publishable/anon key** i `supabase-config.js`. Den nyckeln är avsedd för webbläsaren och skyddas av RLS-reglerna i migreringen. Lägg aldrig `service_role`-nyckeln där.
6. Skapa ditt första konto via familjeinloggningen och ge det administratörsroll i SQL Editor:

   ```sql
   update public.profiles set role = 'admin' where id = 'DITT_USER_ID';
   ```

Vanliga familjemedlemmar får rollen `contributor` och skickar ändringsförslag. Roller `editor` och `admin` kan publicera person- och platsändringar direkt. Bilder lagras i den privata bucketen `family-media`; metadata, synlighet och koppling till person eller plats finns i tabellen `media`.

### Integritet

Importen märker personer utan dödsdatum och med ett modernt födelseår som levande. De får synligheten `family` som utgångspunkt och visas därför bara för inloggade familjemedlemmar när databasen används. Kontrollera alltid denna markering innan webbplatsen publiceras.

### Viktiga filer

- `supabase/migrations/001_family_archive.sql` - tabeller, roller, RLS och bildlagring.
- `scripts/export-supabase-seed.mjs` - gör en importerbar ögonblicksbild av `data.js`.
- `scripts/import-supabase.mjs` - importerar ögonblicksbilden till Supabase.
- `shared-data.js` - läser gemensamma poster, sköter inloggning och skickar ändringar.
- `supabase-config.js` - offentlig projektadress och publishable key.
