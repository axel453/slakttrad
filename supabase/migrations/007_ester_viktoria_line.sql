-- Additive import from the Ester Viktoria focus master dated 2026-09-09.
-- Existing media and user-added content are preserved.
begin;

create or replace function pg_temp.append_unique_jsonb_array(base jsonb, additions jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(value order by first_position), '[]'::jsonb)
  from (
    select value, min(position) as first_position
    from (
      select value, ordinality::bigint as position
      from jsonb_array_elements(coalesce(base, '[]'::jsonb)) with ordinality
      union all
      select value, 1000000 + ordinality::bigint as position
      from jsonb_array_elements(coalesce(additions, '[]'::jsonb)) with ordinality
    ) combined
    group by value
  ) unique_values;
$$;

create or replace function pg_temp.merge_archive_arrays(base jsonb, additions jsonb)
returns jsonb language plpgsql as $$
declare
  result jsonb := coalesce(base, '{}'::jsonb);
  key_name text;
begin
  foreach key_name in array array['aliases','relatedPersonIds','facts','story','timeline','sources','uncertainties','parents','children','images'] loop
    if additions ? key_name then
      result := jsonb_set(result, array[key_name], pg_temp.append_unique_jsonb_array(result->key_name, additions->key_name), true);
    end if;
  end loop;
  return result;
end;
$$;

create or replace function pg_temp.remove_jsonb_array_values(base jsonb, removals jsonb)
returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb)
  from jsonb_array_elements(coalesce(base, '[]'::jsonb)) with ordinality
  where not (removals @> jsonb_build_array(value));
$$;

-- Remove only exact stale statements. Their values remain documented below as conflicts.
update public.people
set content = jsonb_set(
  jsonb_set(content, '{facts}', pg_temp.remove_jsonb_array_values(content->'facts', $j$ [["Föräldrar","Ej kartlagda i denna linje ännu"]]$j$::jsonb), true),
  '{story}', pg_temp.remove_jsonb_array_values(content->'story', $j$ ["Ester Viktoria föds 10 juni 1898 och är bekräftad i hushållet tillsammans med Karl Hjalmar."]$j$::jsonb), true
)
where id = 'ester_viktoria';

update public.people
set content = jsonb_set(
  jsonb_set(content, '{story}', pg_temp.remove_jsonb_array_values(content->'story', $j$ [
    "Karin Margit föds 11 februari 1929 i Morup enligt den senaste morfarsfilen. Hon bär flicknamnet Johansson och tar som gift namnet Bengtsson.",
    "Den senaste morfarsfilen anger att familjeuppgiften om död i oktober 2023 ska ges företräde framför Ancestry-trädets 2022-uppgift tills exakt källa kompletteras."
  ]$j$::jsonb), true),
  '{timeline}', pg_temp.remove_jsonb_array_values(content->'timeline', $j$ [
    ["1929-02-11","Föds i Morup enligt senaste morfarsfilen."],
    ["2023-10","Avlider enligt familjeuppgift; exakt datum ska kompletteras."]
  ]$j$::jsonb), true
)
where id = 'karin_margit';

insert into public.people(id,slug,name,alt_name,born,died,branch,is_direct,is_living,visibility,publish_status,content)
values
(
  'johan_elof_svensson','johan-elof-svensson','Johan Elof Svensson','Joh. Elof Svensson','1862-10-21',null,
  'mother',true,false,'public','published',
  $j$ {
    "name":"Johan Elof Svensson",
    "aliases":["Joh. Elof Svensson"],
    "alt":"Joh. Elof Svensson",
    "role":"Ester Viktorias far · direkt linje",
    "born":"1862-10-21",
    "status":"confirmed",
    "place":"Morup",
    "facts":[
      ["Döpt","1862-10-26"],
      ["Dotter","Ester Viktoria Johansson, bekräftad genom hennes födelse-/SCB-uppgift"],
      ["Maka","Helena/Hilma Augusta Carlsdotter/Karlsdotter"],
      ["Föreslagen hemvist","Morup Sotared 3 enligt Ancestry-profil; ska kontrolleras i original"],
      ["Föreslagen vigsel","1889-06-17 i Morup enligt Ancestry-profil"],
      ["Föreslagen död","1940-12-14 i Falkenberg enligt Ancestry-profil"],
      ["Möjliga föräldrar","Sven Pehrsson och Anna Sofia Bengtsdotter enligt Ancestry; inte bekräftade"]
    ],
    "story":[
      "Johan Elof Svensson är bekräftad som Ester Viktorias far genom hennes födelse-/SCB-uppgift från Morup 1898.",
      "En senare kontroll skiljer hans födelse och dop åt: han föds 21 oktober 1862 och döps 26 oktober. Plats och föräldrar behöver fortfarande läsas i originalkällan.",
      "Ett Ancestry-spår placerar honom vid Sotared 3 i Morup och anger vigsel med Hilma Augusta Karlsdotter 1889 samt död i Falkenberg 1940. Dessa uppgifter bevaras som sekundära ledtrådar och visas inte som säkra fakta."
    ],
    "timeline":[
      ["1862-10-21","Föds enligt senare kontroll i Ester-spåret."],
      ["1862-10-26","Döps."],
      ["1889-06-17","Föreslagen vigsel i Morup med Hilma Augusta Karlsdotter; sekundär uppgift."],
      ["1898-10-06","Dottern Ester Viktoria föds i Morup."],
      ["1940-12-14","Föreslagen död i Falkenberg enligt Ancestry; ej originalkontrollerad."]
    ],
    "sources":[
      "Ester Viktorias födelse-/SCB-uppgift 1898, där Johan/Joh. Elof Svensson anges som far.",
      "Senare kontroll av födelse- och dopuppgift återgiven i släktforskningsmaster 2026-09-09.",
      "Ancestry-profil för Johan Elof Svensson; sekundär forskningsledtråd."
    ],
    "uncertainties":[
      "Sotared 3, vigseln 1889-06-17, dödsuppgiften 1940-12-14 och de föreslagna föräldrarna måste kontrolleras i originalkällor.",
      "De möjliga föräldrarna Sven Pehrsson och Anna Sofia Bengtsdotter är inte kopplade som föräldrar i släktträdet."
    ],
    "parents":[],
    "children":["ester_viktoria"]
  }$j$::jsonb
),
(
  'helena_augusta_carlsdotter','helena-augusta-carlsdotter','Helena Augusta Carlsdotter','Hilma Augusta Karlsdotter',
  'uppg. 1869-09-06','uppg. 1941-01-24','mother',true,false,'public','published',
  $j$ {
    "name":"Helena Augusta Carlsdotter",
    "aliases":["Hilma Augusta Karlsdotter","Helena Augusta Karlsdotter","Hilma Augusta Carlsdotter"],
    "alt":"Hilma Augusta Karlsdotter",
    "role":"Ester Viktorias mor · direkt linje",
    "born":"uppg. 1869-09-06",
    "died":"uppg. 1941-01-24",
    "status":"working",
    "place":"Morup",
    "facts":[
      ["Bekräftad relation","Anges som Ester Viktorias mor i födelse-/SCB-uppgiften 1898"],
      ["Namnform i födelse-/SCB-uppgift","Helena Augusta Carlsdotter"],
      ["Namnform i Ancestry-material","Hilma Augusta Karlsdotter"],
      ["Föreslaget dop","1869-09-12 enligt Ancestry/index"],
      ["Föreslagen dödsort","Falkenberg enligt Ancestry/index"],
      ["Föreslagen vigsel","1889-06-17 i Morup med Johan Elof Svensson"],
      ["Möjliga föräldrar","Karl Aron Tobiasson och Severina Kristina Bengtsdotter enligt Ancestry; inte bekräftade"],
      ["Möjliga barn i hushållet","Selma Charlotta, Anna Serafia, Ester Viktoria och Karl Gustaf Einar enligt Ancestry-material"],
      ["Möjlig syskonkrets","Severin Alfrid, Anders Ludvig, Jenny Eafrosina och Karl Hjalmar Karlsson enligt Ancestry-material"]
    ],
    "story":[
      "Helena Augusta Carlsdotter anges som Ester Viktorias mor i födelse-/SCB-uppgiften 1898. Sekundärt Ancestry-material använder i stället namnet Hilma Augusta Karlsdotter; därför bevaras båda namnformerna.",
      "Ancestry-spåret uppger att hon föds i Morup 6 september 1869, döps 12 september och gifter sig med Johan Elof Svensson 17 juni 1889. Uppgifterna ger en möjlig bild av en ung hustru i en större Morupfamilj, men ska kontrolleras i original innan de låses.",
      "Materialet pekar mot ett hushåll med flera barn och möjlig anknytning till Sotared 3. Esters födelse är bekräftad i relationen, medan de övriga barnen och Helena/Hilmas egen föräldra- och syskonkrets tills vidare är forskningsspår."
    ],
    "timeline":[
      ["1869-09-06","Föreslagen födelse i Morup enligt Ancestry/index."],
      ["1869-09-12","Föreslaget dop."],
      ["1889-06-17","Föreslagen vigsel i Morup med Johan Elof Svensson."],
      ["1898-10-06","Dottern Ester Viktoria föds i Morup."],
      ["1941-01-24","Föreslagen död i Falkenberg enligt Ancestry/index."]
    ],
    "sources":[
      "Ester Viktorias födelse-/SCB-uppgift 1898, där Helena Augusta Carlsdotter anges som mor.",
      "Ancestry-profil och indexuppgifter för Hilma Augusta Karlsdotter; sekundära forskningsledtrådar.",
      "Släktforskningsmaster uppdaterad 2026-09-09, avsnittet om Hilma Augusta."
    ],
    "uncertainties":[
      "Originalbilden behöver avgöra om huvudnamnet är Helena eller Hilma och om patronymikonet ska skrivas Carlsdotter eller Karlsdotter.",
      "Födelse, dop, död, vigsel, föräldrar, övriga barn och syskon kommer från sekundärt material och är inte låsta som bekräftade.",
      "De möjliga föräldrarna Karl Aron Tobiasson och Severina Kristina Bengtsdotter är inte kopplade som föräldrar i släktträdet."
    ],
    "parents":[],
    "children":["ester_viktoria"]
  }$j$::jsonb
)
on conflict(id) do update set
  name=excluded.name,
  alt_name=excluded.alt_name,
  born=excluded.born,
  died=excluded.died,
  branch=excluded.branch,
  is_direct=excluded.is_direct,
  visibility=excluded.visibility,
  publish_status=excluded.publish_status,
  content=pg_temp.merge_archive_arrays(public.people.content,excluded.content)
    || (excluded.content - 'aliases' - 'facts' - 'story' - 'timeline' - 'sources' - 'uncertainties' - 'parents' - 'children' - 'images'),
  updated_at=now();

insert into public.places(id,slug,name,area,latitude,longitude,visibility,publish_status,content)
values
(
  'morup','morup','Morup','Halland',56.994,12.392,'public','published',
  $j$ {
    "id":"morup",
    "name":"Morup",
    "area":"Halland",
    "aliases":["Morup","Morups socken"],
    "relatedPersonIds":["johan_elof_svensson","helena_augusta_carlsdotter","ester_viktoria","karl_hjalmar_johansson","karin_margit"],
    "note":"Bekräftad huvudmiljö för Ester Viktoria Johansson och hennes familj samt för Karl Hjalmar och Karin Margit Johansson.",
    "facts":[
      ["Ester Viktoria","Född 1898-10-06 i Morup och vigd här 1924-07-29 med Karl Hjalmar Johansson."],
      ["Föräldrar","Johan/Joh. Elof Svensson och Helena Augusta Carlsdotter anges i Esters födelse-/SCB-uppgift."],
      ["Familjebildning","Ett sekundärt spår anger att Johan Elof och Helena/Hilma Augusta vigdes i Morup 1889-06-17; uppgiften ska kontrolleras i original."],
      ["Fortsatt forskning","Morups församlingsböcker omkring 1889-1909 kan klargöra hushåll, barnaskara, flyttningar och exakt hemvist."]
    ],
    "story":[
      "Morup är den säkert belagda geografiska kärnan i Ester Viktorias gren. Här föds Ester 1898 och här gifter hon sig med Karl Hjalmar Johansson 1924.",
      "Födelse-/SCB-uppgiften öppnar Esters egen bakåtlinje genom föräldrarna Johan Elof Svensson och Helena Augusta Carlsdotter. Sekundärt material använder även namnformen Hilma Augusta Karlsdotter och pekar mot ett större familjehushåll i socknen.",
      "Sotared 3 är en möjlig mer exakt gårdsmiljö för familjen, medan Skillingshagen hör till Karl Hjalmars sida och parets senare familjesammanhang. Dessa platser hålls isär tills församlingsböckerna visar den exakta flyttkedjan."
    ],
    "timeline":[
      ["1862-10-21","Johan Elof Svensson föds enligt den senaste kontrollen; Morup/Sotared är ännu en föreslagen, inte låst, födelsemiljö."],
      ["1869-09-06","Helena/Hilma Augusta uppges vara född i Morup enligt sekundärt indexmaterial."],
      ["1889-06-17","Föreslagen vigsel i Morup mellan Johan Elof och Helena/Hilma Augusta."],
      ["1898-10-06","Ester Viktoria föds i Morup."],
      ["1924-07-29","Ester Viktoria och Karl Hjalmar Johansson vigs i Morup."],
      ["1929-02-10","Karin Margit Johansson föds i Morup enligt masterfilen 2026-09-09."]
    ],
    "sources":["Morups födelse-/SCB-uppgift 1898 för Ester Viktoria.","Morups vigselpost 1924-07-29 för Ester Viktoria och Karl Hjalmar Johansson.","Släktforskningsmaster uppdaterad 2026-09-09 med Ester Viktorias gren."],
    "uncertainties":["Johan Elofs och Helena/Hilma Augustas födelseplatser, vigsel 1889 samt familjens exakta bostad behöver verifieras i originalkällor."]
  }$j$::jsonb
),
(
  'skillingshagen','skillingshagen','Skillingshagen','Morup',56.997,12.383,'public','published',
  $j$ {
    "id":"skillingshagen",
    "name":"Skillingshagen",
    "area":"Morup",
    "aliases":["Skillingshagen","Morup No 5"],
    "relatedPersonIds":["karl_hjalmar_johansson","ester_viktoria","karin_margit"],
    "note":"Hushållsplats för Karl Hjalmars familj och senare familjemiljö för Ester Viktoria Johansson.",
    "facts":[["Hushåll","Karl Hjalmar Johansson hör till Morup No 5, Skillingshagen."],["Esterlinjen","Genom vigseln 1924 knyts Ester Viktorias egen Morup-gren till Karl Hjalmars Skillingshagen-linje."]],
    "story":["Skillingshagen hör till Karl Hjalmar Johanssons familjemiljö i Morup. När han gifter sig med Ester Viktoria 1924 binds platsen samman med hennes egen Morup-gren.","Masterfilen fastställer inte parets exakta gemensamma bostad efter vigseln. Församlingsböckerna behöver därför följas innan Skillingshagen anges som Esters säkra bostadsadress."],
    "sources":["Släktforskningsmaster uppdaterad 2026-09-09 med Ester Viktorias gren."],
    "uncertainties":["Esters exakta boendetid på Skillingshagen är ännu inte originalbelagd."]
  }$j$::jsonb
),
(
  'sotared_3','sotared-3','Sotared 3','Morup',null,null,'public','published',
  $j$ {
    "id":"sotared_3",
    "name":"Sotared 3",
    "area":"Morup",
    "aliases":["Sotared 3","Morup Sotared 3","Sotared"],
    "relatedPersonIds":["johan_elof_svensson","helena_augusta_carlsdotter","ester_viktoria"],
    "note":"Möjlig familjemiljö för Ester Viktorias föräldrafamilj enligt sekundärt Ancestry-material; originalkontroll återstår.",
    "facts":[["Föreslagen familj","Johan Elof Svensson och Helena/Hilma Augusta Carlsdotter/Karlsdotter."],["Föreslagna barn","Selma Charlotta och Anna Serafia kopplas i materialet till Sotared 3; Ester Viktorias egen koppling behöver verifieras."],["Källstatus","Sekundär ledtråd från Ancestry-profil, inte originalkällbelagd."],["Kartstatus","Ingen verifierad gårdspunkt är inlagd ännu."]],
    "story":["Sotared 3 är ett lovande men ännu inte säkert gårdsspår i Ester Viktorias bakgrund. Ett sekundärt Ancestry-spår placerar Johan Elof Svensson där och kopplar Esters föreslagna äldre syskon till platsen.","Om uppgifterna bekräftas i Morups församlingsböcker kan Sotared 3 bli den konkreta familjemiljö där Ester växte upp. Tills dess är platsen tydligt markerad som forskningsspår, inte som fastslagen bostad."],
    "timeline":[["1889-1909","Sekundärt material föreslår att Johan Elofs och Helena/Hilma Augustas familj kan ha varit knuten till Sotared 3 under denna period."],["1898-10-06","Ester Viktoria föds i Morup; hennes exakta koppling till Sotared 3 återstår att verifiera."]],
    "sources":["Ancestry-profil för Johan Elof Svensson och närliggande familjesammanställning, återgiven i släktforskningsmaster 2026-09-09."],
    "uncertainties":["Hushållets sammansättning, exakt fastighetsbeteckning och Esters vistelse på Sotared 3 behöver bekräftas i originalförsamlingsböcker."]
  }$j$::jsonb
),
(
  'falkenberg','falkenberg','Falkenberg','Halland',null,null,'public','published',
  $j$ {
    "id":"falkenberg",
    "name":"Falkenberg",
    "area":"Halland",
    "aliases":["Falkenberg"],
    "relatedPersonIds":["johan_elof_svensson","helena_augusta_carlsdotter"],
    "note":"Föreslagen dödsort för Johan Elof Svensson och Helena/Hilma Augusta Carlsdotter/Karlsdotter enligt sekundärt indexmaterial.",
    "facts":[["Johan Elof Svensson","Föreslagen död 1940-12-14 i Falkenberg."],["Helena/Hilma Augusta","Föreslagen död 1941-01-24 i Falkenberg."],["Källstatus","Båda uppgifterna kommer från Ancestry/indexspår och behöver kontrolleras mot dödbok och församlingsbok."]],
    "story":["Falkenberg förekommer som möjlig senare livsmiljö för Ester Viktorias föräldrar. Sekundärt material anger att Johan Elof avlider där 1940 och Helena/Hilma Augusta 1941.","Platskopplingen bevaras för fortsatt forskning men ska inte betraktas som originalkällbekräftad förrän paret har följts från Morup i församlingsböckerna och dödnotiserna har lästs."],
    "timeline":[["1940-12-14","Föreslagen död för Johan Elof Svensson i Falkenberg."],["1941-01-24","Föreslagen död för Helena/Hilma Augusta i Falkenberg."]],
    "sources":["Ancestry-/indexuppgifter återgivna i släktforskningsmaster 2026-09-09."],
    "uncertainties":["Dödsdatumen och kopplingen till Falkenberg är ännu inte kontrollerade i originalkälla."]
  }$j$::jsonb
)
on conflict(id) do update set
  name=excluded.name,
  area=excluded.area,
  latitude=coalesce(public.places.latitude,excluded.latitude),
  longitude=coalesce(public.places.longitude,excluded.longitude),
  content=pg_temp.merge_archive_arrays(public.places.content,excluded.content)
    || (excluded.content - 'aliases' - 'relatedPersonIds' - 'facts' - 'story' - 'timeline' - 'sources' - 'uncertainties' - 'images'),
  updated_at=now();

insert into public.family_units(id,generation,branch,person_ids,child_unit_ids,content)
values('u_johan_elof_hilma',3,'mother',array['johan_elof_svensson','helena_augusta_carlsdotter'],array['u_karl_ester'],'{"ancestor":true}'::jsonb)
on conflict(id) do update set
  generation=excluded.generation,
  branch=excluded.branch,
  person_ids=excluded.person_ids,
  child_unit_ids=excluded.child_unit_ids,
  content=public.family_units.content || excluded.content,
  updated_at=now();

insert into public.relationships(person_id,related_person_id,kind)
values
  ('ester_viktoria','johan_elof_svensson','parent'),
  ('ester_viktoria','helena_augusta_carlsdotter','parent')
on conflict(person_id,related_person_id,kind) do nothing;
insert into public.people(id,slug,name,alt_name,born,died,branch,is_direct,is_living,visibility,publish_status,content)
values
(
  'ester_viktoria','ester-viktoria-johansson','Ester Viktoria Johansson','Ester Viktoria Johansdotter',
  '1898-10-06',null,'mother',true,false,'public','published',
  $j$ {
    "name":"Ester Viktoria Johansson",
    "aliases":["Ester Viktoria Johansdotter"],
    "alt":"Ester Viktoria Johansdotter",
    "role":"Karin Margits mor · direkt linje",
    "born":"1898-10-06",
    "status":"confirmed",
    "place":"Morup",
    "facts":[
      ["Födelseort","Morup, Halland"],
      ["Tidigare felaktig födelseuppgift","1898-06-10 förekom i äldre arbetsmaterial; vigselpost och födelse-/SCB-uppgift stöder 1898-10-06"],
      ["Vigsel","1924-07-29 i Morup med Karl Hjalmar Johansson"],
      ["Far","Johan/Joh. Elof Svensson"],
      ["Mor","Helena Augusta Carlsdotter i födelse-/SCB-uppgiften; Hilma Augusta Karlsdotter i sekundärt material"],
      ["Miljö","Morup, med möjlig barndomskoppling till Sotared 3 och senare familjekoppling till Skillingshagen"]
    ],
    "story":[
      "Ester Viktoria föds 6 oktober 1898 i Morup som dotter till Johan/Joh. Elof Svensson och Helena Augusta Carlsdotter. Det tidigare datumet 10 juni 1898 har korrigerats genom vigselposten och födelse-/SCB-uppgiften.",
      "Hon växer upp i Morups kust- och jordbruksmiljö. Ett sekundärt Ancestry-spår pekar mot Sotared 3 som möjlig familjemiljö, men den exakta barndomsadressen ska kontrolleras i Morups församlingsbok.",
      "Den 29 juli 1924 gifter Ester sig i Morup med Karl Hjalmar Johansson. Genom äktenskapet förenas hennes egen Morup-gren med Karl Hjalmars familj vid Morup No 5 och Skillingshagen.",
      "Ester ska behandlas som en egen person med egen bakgrund, inte enbart som maka eller mor. Fortsatt forskning gäller hennes barndomshushåll, flyttningar, eventuell tjänst som piga före vigseln och parets gemensamma bostad efter 1924."
    ],
    "timeline":[
      ["1898-10-06","Föds i Morup enligt födelse-/SCB-uppgift och senare vigselpost."],
      ["1924-07-29","Vigs i Morup med Karl Hjalmar Johansson."],
      ["1924-11-10","Dottern Asta Linnéa föds."],
      ["1929-02-10","Dottern Karin Margit föds i Morup enligt den senaste masterfilen."],
      ["1924-1939","Familjen får sju kända barn."]
    ],
    "sources":[
      "Morups födelse-/SCB-uppgift 1898 för Ester Viktoria, återgiven i släktforskningsmaster 2026-09-09.",
      "Morups vigselpost 1924-07-29 för Karl Hjalmar Johansson och Ester Viktoria Johansson.",
      "Släktforskningsmaster uppdaterad 2026-09-09 med Ester Viktoria som fokusspår."
    ],
    "uncertainties":[
      "Moderns namnform Helena/Hilma Augusta Carlsdotter/Karlsdotter behöver kontrolläsas i originalbild.",
      "Sotared 3 är en möjlig familjemiljö enligt sekundärt Ancestry-material och är ännu inte originalkällbelagd för Ester.",
      "Esters barndomshushåll, flyttningar och eventuell tjänst före vigseln behöver följas i Morups församlingsböcker."
    ],
    "parents":["johan_elof_svensson","helena_augusta_carlsdotter"],
    "children":["asta_linnea","elsa_ingegerd","karin_margit","erik_bertil","gosta_ingemar","karl_john_uno","sjunne_lennart"]
  }$j$::jsonb
),
(
  'karl_hjalmar_johansson','karl-hjalmar-johansson','Karl Hjalmar Johansson',null,
  '1889-06-07',null,'mother',true,false,'public','published',
  $j$ {
    "name":"Karl Hjalmar Johansson",
    "role":"Direkt linje",
    "born":"1889-06-07",
    "status":"confirmed",
    "place":"Morup / Skillingshagen",
    "facts":[
      ["Boende","Morup No 5, Skillingshagen"],
      ["Vigsel","1924-07-29 i Morup med Ester Viktoria Johansson"],
      ["Hustru","Ester Viktoria Johansson/Johansdotter, född 1898-10-06"]
    ],
    "story":[
      "Karl Hjalmar föds 7 juni 1889 i Morup, son till Johan Andersson och Britta Lovisa. Hushållet finns vid Morup No 5, Skillingshagen.",
      "Den 29 juli 1924 gifter han sig i Morup med Ester Viktoria Johansson. Vigselposten bekräftar bådas födelsedatum och binder samman Karl Hjalmars Skillingshagen-linje med Esters egen Morup-gren.",
      "Han och Ester Viktoria får sju kända barn, däribland Karin Margit."
    ],
    "timeline":[
      ["1889-06-07","Föds i Morup."],
      ["1924-07-29","Vigs i Morup med Ester Viktoria Johansson."],
      ["1924-1939","Paret får sju kända barn, däribland Karin Margit."]
    ],
    "sources":["Morups vigselpost 1924-07-29, återgiven i släktforskningsmaster 2026-09-09."],
    "parents":["johan_andersson","britta_lovisa"],
    "children":["asta_linnea","elsa_ingegerd","karin_margit","erik_bertil","gosta_ingemar","karl_john_uno","sjunne_lennart"]
  }$j$::jsonb
),
(
  'karin_margit','karin-margit-johansson','Karin Margit Johansson','g. Bengtsson',
  '1929-02-10','2022-10-05','mother',true,false,'public','published',
  $j$ {
    "name":"Karin Margit Johansson",
    "alt":"g. Bengtsson",
    "role":"Mormor",
    "born":"1929-02-10",
    "died":"2022-10-05",
    "status":"confirmed",
    "place":"Morup / Klastorp",
    "facts":[
      ["Liv","Flyttade till Klastorp på 1950-talet"],
      ["Födelseuppgift i senaste master","1929-02-10 i Morup"],
      ["Dödsuppgift i senaste master","2022-10-05 enligt dödsannons"],
      ["Tidigare publicerad födelseuppgift","1929-02-11; skillnaden bevaras för källkontroll"],
      ["Tidigare familjeuppgift om död","Oktober 2023; ersätts i huvudfältet av dödsannonsens 2022-10-05 men bevaras som avvikelse"]
    ],
    "story":[
      "Karin Margit föds 10 februari 1929 i Morup enligt masterfilen 2026-09-09. Den tidigare publicerade uppgiften 11 februari bevaras som en avvikelse tills födelsekällan har dokumenterats fullt ut.",
      "Hon är dotter till Karl Hjalmar Johansson och Ester Viktoria Johansson. Hon bär flicknamnet Johansson och tar som gift namnet Bengtsson.",
      "På 1950-talet flyttar hon med Axel Harry Bengtsson till Klastorp. Tillsammans får de barnen Ingemar och Gerd.",
      "Masterfilen anger död 5 oktober 2022 enligt dödsannons. En tidigare familjeuppgift om oktober 2023 bevaras öppet i källhistoriken men används inte längre som huvuddatum."
    ],
    "timeline":[
      ["1929-02-10","Föds i Morup enligt masterfilen 2026-09-09."],
      ["1950-talet","Flyttar med Harry Bengtsson till Klastorp."],
      ["2022-10-05","Avlider enligt dödsannons återgiven i den senaste masterfilen."]
    ],
    "sources":[
      "Dödsannons för Karin Margit Bengtsson, återgiven i släktforskningsmaster 2026-09-09.",
      "Släktforskningsmaster uppdaterad 2026-09-09 med Ester Viktorias gren."
    ],
    "uncertainties":[
      "Födelsedagen 10 eller 11 februari 1929 bör avgöras genom en fullständig original- eller officiell födelseuppgift.",
      "Den äldre familjeuppgiften om död i oktober 2023 avviker från dödsannonsens 2022-10-05 och bevaras som källkonflikt."
    ],
    "parents":["karl_hjalmar_johansson","ester_viktoria"],
    "children":["ingemar_bengtsson","gerd_bengtsson"]
  }$j$::jsonb
)
on conflict(id) do update set
  name=excluded.name,
  alt_name=excluded.alt_name,
  born=excluded.born,
  died=excluded.died,
  branch=excluded.branch,
  is_direct=excluded.is_direct,
  visibility=excluded.visibility,
  publish_status=excluded.publish_status,
  content=pg_temp.merge_archive_arrays(public.people.content,excluded.content)
    || (excluded.content - 'aliases' - 'facts' - 'story' - 'timeline' - 'sources' - 'uncertainties' - 'parents' - 'children' - 'images')
    || jsonb_build_object('parents',excluded.content->'parents','children',excluded.content->'children'),
  updated_at=now();

commit;
