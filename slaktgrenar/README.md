# Släktgrenar för Nilsson/Bengtsson släktträd

**Senast uppdaterad:** 2026-09-07

Det här är arbetsmappen för att hålla isär släktgrenarna:

- `mammas_sida_gerd.md` – Gerd Bengtssons sida, med Karin Margit Johansson/Bengtsson och den hittills kartlagda Hallandslinjen bakåt.
- `mammas_sida_gerd_syskon_faddrar_2026-07-06.md` – kompletterande källversion med Arvids bouppteckning, barnens mödernearv samt Bengt och Nils Arfvidssons födelse- och fadderspår. Webbdata importerad 2026-09-07 med konflikter bevarade.
- `mammas_morfar_bengtssonlinjen.md` – bevarad arbetsversion motsvarande morfars master v102.
- `mammas_morfar_bengtssonlinjen_v125.md` – senaste inlästa morfarskälla, daterad 2026-09-01. Relevanta person-, gårds-, tidslinje- och källuppgifter importerades additivt till webbdata 2026-09-07.
- `valagarden_jons_nilsgard_master_2026-09-01.md` – bevarad Valagården-master. Dess additiva person-, gårds-, dokument- och källuppgifter finns i webbdata och databasmigration `003_valagarden_master_additions.sql`.
- `pappas_sida_goran.md` – Göran Nilssons sida, identisk med den senast mottagna källfilen `slaktforskning_fars_sida_uppdaterad_v28.md`.
- `farfars_sida_nils_stig_henning.md` – farfars sida via Nils Stig Henning Nilsson, identisk med den senast mottagna källfilen `slaktforskning_farfars_sida_v61.md`.

Den tidigare masterfilen `../master_slaktforskning_2026-07-06.md` finns kvar som samlad historik. Framåt är det enklast att mata in ny information i rätt grenfil först och sedan låta hemsidans `data.js` byggas vidare utifrån dessa arbetsfiler.

## Rekommenderat arbetssätt

1. Lägg ny forskning på rätt grenfil, till exempel mormor, morfar, farmor eller farfar.
2. Markera alltid status: bekräftat, starkt sannolikt, arbetsantagande eller öppet spår.
3. Lägg in källa eller notering direkt under personen.
4. När en uppgift ska synas på hemsidan uppdateras `../data.js` och Vercel-mappen.
