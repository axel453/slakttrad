// Axels släkt - datafil
// Personer, familje-/visningsenheter, relationer och platser.
// Uppdatera helst data här, inte i HTML- eller app-logiken.


const STATUS_LABEL = { confirmed:"Bekräftat", likely:"Starkt sannolikt", working:"Arbetsantagande", open:"Öppet spår" };

const PEOPLE = {
  lars_esbjornsson:{name:"Lars Esbjörnsson",role:"Carls far",status:"confirmed",place:"Tjärby, Grimeton",facts:[["Koppling","Far till Carl Larsson"],["Källa","Carls födelsenotis 1777"]],story:["Lars Esbjörnsson är bekräftad som Carls far i födelsenotisen 1777.","Släktingens dokument pekade sedan tidigare mot Lars Esbjörnsson från Tjärby i Grimeton. Den aktuella födelsenotisens läsning stärker faderskapet."],parents:[],children:["carl_larsson"]},
  inger_jonsdotter:{name:"Inger Jonsdotter",role:"Carls mor",born:"ca 1743",status:"confirmed",place:"Tjärby, Grimeton",facts:[["Ålder i Carls födelsenotis","34 år"],["Koppling","Mor till Carl Larsson"],["Status","Eget ursprung ej färdigkartlagt"]],story:["Inger Jonsdotter är bekräftad som Carls mor i födelsenotisen 1777. Där anges hon som 34 år.","Hennes eget ursprung är ännu inte färdigkartlagt."],parents:[],children:["carl_larsson"]},

  arvid_svensson:{name:"Arvid Svensson",alt:"Arfvid Svensson",role:"Bengtas far",born:"ca 1720-11",died:"1785-02-22",status:"confirmed",place:"Munkaskog, Sven Börges gård, Tvååker",facts:[["Begravd","1785-02-24"],["Hemman","1/2 kronohemman nr 5 Munkaskog"],["Civilstånd vid död","Änkling"],["Ålder i dödnotis","64 år, 3 månader, 11 dagar"],["Dödsorsak","Tolkad som hufvudsjuka / huvudvärkssjuka"],["Bouppteckning","1785-03-22"],["Barn","Hans, Anders, Inger, Bengt, Nils och Bengta"]],story:["Arvid Svensson, även skriven Arfvid Svensson, är Bengtas far enligt födelsenotisen 1774 och är ytterligare stärkt genom bouppteckningen 1785.","Bouppteckningen efter Arfvid Svensson upprättades 22 mars 1785 och gäller mannen på 1/2 kronohemman nr 5 Munkaskog. Den anger barnen med åldrar och binder Bengta till rätt familj och plats.","Boet visar ett etablerat men inte rikt bondehushåll med gårdsdrift, kreatur, textilier, hushållsföremål, bibel och postilla, men även skulder och gravationer."],timeline:[["ca 1720-11","Född, beräknat från ålder i dödnotis."],["1774-10-20","Dottern Bengta föds i Munkaskog."],["1785-02-22","Dör som änkling i Munkaskog, Sven Börges/Sven Börjes gård."],["1785-02-24","Begravs."],["1785-03-22","Bouppteckning upprättas efter Arfvid Svensson."]],parents:[],children:["hans_arfvidsson","anders_arfvidsson","inger_arfvidsdotter","bengt_arfvidsson","nils_arfvidsson","bengta_arvidsdotter"]},
  elin_bengtsdotter:{name:"Elin Bengtsdotter",role:"Bengtas mor",born:"ca dec 1732 / jan 1733",died:"1779-03-28",status:"confirmed",place:"Munkaskog, Sven Börges gård, Tvååker",facts:[["Begravd","1779-04-01"],["Civilstånd vid död","Gift"],["Make","Arfvid / Arvid Svensson"],["Ålder i dödnotis","46 år, 3 månader"],["Dödsorsak","Bröstsjuka"],["Koppling","Mor till Bengta Arvidsdotter"]],story:["Elin Bengtsdotter är bekräftad som Bengtas mor i födelsenotisen 1774.","Dödnotisen anger henne som åboen Arfvid Svenssons hustru i Munkaskog, Sven Börges/Sven Börjes gård. Detta stärker familjegruppen i samma gårdsmiljö.","Elins eget ursprung är ännu inte löst. Nästa steg är att hitta vigseln med Arfvid eller spåra barnens födelsenotiser och faddrar."],timeline:[["ca 1732/1733","Född, beräknat från ålder i dödnotis."],["1774-10-20","Dottern Bengta föds."],["1779-03-28","Dör i Munkaskog, dödsorsak bröstsjuka."],["1779-04-01","Begravs."]],parents:[],children:["hans_arfvidsson","anders_arfvidsson","inger_arfvidsdotter","bengt_arfvidsson","nils_arfvidsson","bengta_arvidsdotter"]},
  hans_arfvidsson:{name:"Hans Arfvidsson",born:"ca 1755",status:"confirmed",role:"Syskon till Bengta",facts:[["Ålder 1785","30 år"],["Källa","Bouppteckning efter Arfvid Svensson 1785"],["Kommentar","Myndig son"]],story:["Hans anges som 30-årig son i bouppteckningen efter Arfvid Svensson i Munkaskog 1785."],parents:["arvid_svensson","elin_bengtsdotter"],children:[]},
  anders_arfvidsson:{name:"Anders Arfvidsson",born:"ca 1760/1761",status:"confirmed",role:"Syskon till Bengta",facts:[["Ålder 1785","24 år"],["Källa","Bouppteckning efter Arfvid Svensson 1785"],["Kommentar","Myndig son"]],story:["Anders anges som 24-årig son i bouppteckningen efter Arfvid Svensson i Munkaskog 1785."],parents:["arvid_svensson","elin_bengtsdotter"],children:[]},
  inger_arfvidsdotter:{name:"Inger Arfvidsdotter",born:"ca 1764/1765",status:"confirmed",role:"Syskon till Bengta",facts:[["Ålder 1785","20 år"],["Källa","Bouppteckning efter Arfvid Svensson 1785"]],story:["Inger anges som 20-årig dotter i bouppteckningen efter Arfvid Svensson i Munkaskog 1785."],parents:["arvid_svensson","elin_bengtsdotter"],children:[]},
  bengt_arfvidsson:{name:"Bengt Arfvidsson",born:"ca 1768/1769",status:"confirmed",role:"Syskon till Bengta",facts:[["Ålder 1785","16 år"],["Källa","Bouppteckning efter Arfvid Svensson 1785"],["Kommentar","Kan vara samma Bengt som tidigare nämnts som broder Bengt i husförhörsspår"]],story:["Bengt anges som 16-årig son i bouppteckningen efter Arfvid Svensson. Han kan vara relevant för tidigare spår där en broder Bengt nämns."],parents:["arvid_svensson","elin_bengtsdotter"],children:[]},
  nils_arfvidsson:{name:"Nils Arfvidsson",alt:"Nils Arvidsson",born:"ca 1770/1771",status:"confirmed",role:"Syskon till Bengta",facts:[["Ålder 1785","14 år"],["Källa","Bouppteckning efter Arfvid Svensson 1785"],["Kommentar","Möjlig koppling till tidigare Nils-spår i Munkaskog"]],story:["Nils anges som 14-årig son i bouppteckningen efter Arfvid Svensson. Detta ger tydligare kontext åt det tidigare Nils-spåret i Munkaskog."],parents:["arvid_svensson","elin_bengtsdotter"],children:[]},

  carl_larsson:{name:"Carl Larsson",role:"Anfader i ledet",born:"1777-11-26",died:"ca 1865",status:"confirmed",place:"Rönås, Tvååker",facts:[["Döpt","1777-11-27"],["Födelseplats","Tjärby, Grimeton"],["Yrke","Dräng, saltsjöfiskare, undantagsman"],["Vigsel","1806-03-08, Tvååker (28 år)"]],story:["Carl föds 26 november 1777 i Tjärby, Grimeton och döps dagen efter. Födelsenotisen anger fadern Lars Esbjörnsson och modern Inger Jonsdotter.","Vid vigseln 1806 står han som dräng i Rönås och anges vara 28 år. Senare återkommer han i Tvååker/Rönås/Ågård-spåret och arbetar bland annat som saltsjöfiskare.","En dödboksnotis 1865 nämner Carl Larsson, undantagsman i Ågård, med ålderdom som dödsorsak."],timeline:[["1777-11-26","Föds i Tjärby, Grimeton."],["1777-11-27","Döps."],["1806-03-08","Gifter sig med Bengta Arvidsdotter."],["1806-04-15","Sonen Anders föds."],["1865","Trolig död som undantagsman i Ågård."]],parents:["lars_esbjornsson","inger_jonsdotter"],children:["anders_carlsson","nils_carlsson","anna_lena_carlsdotter"]},
  bengta_arvidsdotter:{name:"Bengta Arvidsdotter",alt:"Arfvidsdotter",role:"Anmoder i ledet",born:"1774-10-20",status:"confirmed",place:"Munkaskog, Tvååker",facts:[["Döpt","1774-10-23"],["Plats","Munkaskog, Sven Börges gård"],["Vigsel","Piga i Munkaskog (31 år)"],["Bouppteckning","Nämns som 10-årig dotter i Arfvid Svenssons bouppteckning 1785-03-22"],["Syskon","Hans, Anders, Inger, Bengt och Nils"],["Bedömning","Mycket starkt underlag för identifikationen"]],story:["Bengta föds 20 oktober 1774 och döps tre dagar senare på Sven Börges gård i Munkaskog. Föräldrarna anges som Arfvid/Arvid Svensson och Elin Bengtsdotter.","Bouppteckningen efter Arfvid Svensson 1785 räknar upp en dotter Bengta som 10 år gammal. Det passar mycket väl med Bengta född 1774-10-20 och gör identifikationen mycket stark.","Bengta blev moderlös 1779 och faderlös 1785. Hon växte sannolikt upp i ett etablerat men inte rikt bondhushåll på 1/2 kronohemman nr 5 Munkaskog.","Vid vigseln 1806 är hon piga i Munkaskog och anges vara 31 år."],timeline:[["1774-10-20","Föds i Munkaskog, Sven Börges gård."],["1774-10-23","Döps."],["1779-03-28","Modern Elin dör."],["1785-02-22","Fadern Arfvid dör."],["1785-03-22","Nämns som 10-årig dotter i bouppteckningen."],["1806-03-08","Gifter sig med Carl Larsson."]],parents:["arvid_svensson","elin_bengtsdotter"],children:["anders_carlsson","nils_carlsson","anna_lena_carlsdotter"]},
  nils_carlsson:{name:"Nils Carlsson",born:"1809-04-09",status:"confirmed",role:"Syskon",story:["Syskon till Anders, fött 9 april 1809. Grenen är ännu inte utforskad."],parents:["carl_larsson","bengta_arvidsdotter"],children:[]},
  anna_lena_carlsdotter:{name:"Anna Lena Carlsdotter",born:"1814-10-13",status:"confirmed",role:"Syskon",story:["Syskon till Anders, född 13 oktober 1814. Grenen är ännu inte utforskad."],parents:["carl_larsson","bengta_arvidsdotter"],children:[]},

  anders_carlsson:{name:"Anders Carlsson",role:"Direkt linje",born:"1806-04-15",status:"confirmed",place:"Rönås, Tvååker",facts:[["Döpt","1806-04-16"],["Yrke","Dräng, tillträdande åbo"],["Vigsel","1834-12-30, No 5 Munkaskog"]],story:["Anders föds 15 april 1806 i Tvååker som son till Carl Larsson och Bengta Arvidsdotter.","Han står i husförhörslängderna med föräldrarna fram till omkring 1825 och arbetar sedan som dräng på bland annat Munkaskog och Lilla Wråen.","1834 gifter han sig med Johanna Svensdotter och tillträder som åbo i No 5 Munkaskog. Sonen Johan, född 1849, för linjen vidare."],timeline:[["1806-04-15","Föds i Tvååker."],["1806-04-16","Döps."],["ca 1825","Lämnar föräldrahemmet och börjar arbeta som dräng."],["1825-1834","Dräng på bland annat Munkaskog och Lilla Wråen."],["1834-12-30","Gifter sig med Johanna Svensdotter."],["1849-02-15","Sonen Johan Andersson föds."]],parents:["carl_larsson","bengta_arvidsdotter"],children:["lars_august","sven_johan_andersson","christina_andersdotter","bengt_aron_andersson","johan_andersson"]},
  johanna_svensdotter:{name:"Johanna Svensdotter",role:"Maka",born:"1808-01-12",status:"confirmed",place:"Munkaskog",facts:[["Vigsel","Piga i No 5 Munkaskog (1834)"],["Föräldrar","Äldre linje ej färdigkartlagd"]],story:["Johanna föds 12 januari 1808 enligt senare uppgifter. Vid vigseln 1834 är hon piga i No 5 Munkaskog.","Hennes äldre föräldralinje är ännu inte färdigkartlagd och bör utforskas separat."],parents:[],children:["lars_august","sven_johan_andersson","christina_andersdotter","bengt_aron_andersson","johan_andersson"]},
  lars_august:{name:"Lars August",born:"1834-11-04",status:"working",role:"Möjligt syskon",facts:[["Obs","Bör kontrolleras i originalbild"]],story:["Möjligt barn enligt register, fött 1834. Bör bekräftas i originalbild."],parents:["anders_carlsson","johanna_svensdotter"],children:[]},
  sven_johan_andersson:{name:"Sven Johan Andersson",born:"1835-04-03",status:"confirmed",role:"Syskon",story:["Sven Johan föds 3 april 1835 inom äktenskapet. Johanna var sannolikt gravid vid vigseln 1834."],parents:["anders_carlsson","johanna_svensdotter"],children:[]},
  christina_andersdotter:{name:"Christina",born:"1841-08-04",status:"working",role:"Syskon",facts:[["Obs","Bör kontrolleras i originalbild"]],story:["Syskon fött 1841, bör kontrolleras i originalbild."],parents:["anders_carlsson","johanna_svensdotter"],children:[]},
  bengt_aron_andersson:{name:"Bengt Aron",born:"1845-10-24",status:"working",role:"Syskon",facts:[["Obs","Bör kontrolleras i originalbild"]],story:["Syskon fött 1845, bör kontrolleras i originalbild."],parents:["anders_carlsson","johanna_svensdotter"],children:[]},

  johan_andersson:{name:"Johan Andersson",role:"Direkt linje",born:"1849-02-15",status:"confirmed",place:"Tvååker",facts:[["Vigsel","1874-09-11, dräng i Grytås"],["Boende","Morups Prästgård / Skillingshagen"]],story:["Johan föds 15 februari 1849 i Tvååker, son till Anders Carlsson och Johanna Svensdotter.","Vid vigseln 1874 står han som dräng i Grytås. Familjen bor senare vid Morups Prästgård och Skillingshagen."],parents:["anders_carlsson","johanna_svensdotter"],children:["augusta_charlotta","birger_johansson","jenny_johansson","karl_hjalmar_johansson"]},
  britta_lovisa:{name:"Britta Lovisa Carlsdotter",alt:"Karlsdotter",role:"Maka",born:"1849-05-16",status:"confirmed",place:"trol. Tvååker",facts:[["Vigsel","Piga, trol. Långås No 3"],["Föräldrar","Ej kartlagda i denna linje ännu"]],story:["Britta Lovisa föds 16 maj 1849, troligen i Tvååker. Vid giftet är hon piga, troligen i Långås No 3."],parents:[],children:["augusta_charlotta","birger_johansson","jenny_johansson","karl_hjalmar_johansson"]},
  augusta_charlotta:{name:"Augusta Charlotta",born:"1881-12-19",status:"confirmed",role:"Syskon",story:["Syskon fött 1881. Grenen är ännu inte utforskad."],parents:["johan_andersson","britta_lovisa"],children:[]},
  birger_johansson:{name:"Birger",born:"1884-02-13",status:"confirmed",role:"Syskon",story:["Syskon fött 1884. Grenen är ännu inte utforskad."],parents:["johan_andersson","britta_lovisa"],children:[]},
  jenny_johansson:{name:"Jenny",born:"1886-12-22",status:"confirmed",role:"Syskon",story:["Syskon fött 1886. Grenen är ännu inte utforskad."],parents:["johan_andersson","britta_lovisa"],children:[]},

  karl_hjalmar_johansson:{name:"Karl Hjalmar Johansson",role:"Direkt linje",born:"1889-06-07",status:"confirmed",place:"Morup",facts:[["Boende","Morup No 5, Skillingshagen"]],story:["Karl Hjalmar föds 7 juni 1889 i Morup, son till Johan Andersson och Britta Lovisa. Hushållet finns vid Morup No 5, Skillingshagen.","Han och Ester Viktoria får sju kända barn, däribland Karin Margit."],parents:["johan_andersson","britta_lovisa"],children:["asta_linnea","elsa_ingegerd","karin_margit","erik_bertil","gosta_ingemar","karl_john_uno","sjunne_lennart"]},
  ester_viktoria:{name:"Ester Viktoria Johansson",role:"Maka",born:"1898-06-10",status:"confirmed",facts:[["Hushåll","Bekräftad med Karl Hjalmar"],["Föräldrar","Ej kartlagda i denna linje ännu"]],story:["Ester Viktoria föds 10 juni 1898 och är bekräftad i hushållet tillsammans med Karl Hjalmar."],parents:[],children:["asta_linnea","elsa_ingegerd","karin_margit","erik_bertil","gosta_ingemar","karl_john_uno","sjunne_lennart"]},
  asta_linnea:{name:"Asta Linnéa",born:"1924-11-10",status:"confirmed",role:"Syskon",story:["Syskon fött 1924. Grenen är ännu inte utforskad."],parents:["karl_hjalmar_johansson","ester_viktoria"],children:[]},
  elsa_ingegerd:{name:"Elsa Ingegerd",born:"1926",status:"working",role:"Syskon",facts:[["Obs","Datum 1926-05-04 eller 1926-04-05, dubbelkontrollera"]],story:["Syskon fött 1926. Födelsedatumet anges på två sätt och bör dubbelkontrolleras."],parents:["karl_hjalmar_johansson","ester_viktoria"],children:[]},
  erik_bertil:{name:"Erik Bertil",born:"1930-09-30",status:"confirmed",role:"Syskon",story:["Syskon fött 1930. Grenen är ännu inte utforskad."],parents:["karl_hjalmar_johansson","ester_viktoria"],children:[]},
  gosta_ingemar:{name:"Gösta Ingemar",born:"1933-02-07",status:"confirmed",role:"Syskon",story:["Syskon fött 1933. Grenen är ännu inte utforskad."],parents:["karl_hjalmar_johansson","ester_viktoria"],children:[]},
  karl_john_uno:{name:"Karl John Uno",born:"1936-07-25",status:"confirmed",role:"Syskon",story:["Syskon fött 1936. Grenen är ännu inte utforskad."],parents:["karl_hjalmar_johansson","ester_viktoria"],children:[]},
  sjunne_lennart:{name:"Sjunne Lennart",born:"1939-10-30",status:"confirmed",role:"Syskon",story:["Syskon fött 1939. Grenen är ännu inte utforskad."],parents:["karl_hjalmar_johansson","ester_viktoria"],children:[]},

  karin_margit:{name:"Karin Margit Johansson",alt:"g. Bengtsson",role:"Huvudperson",born:"1929-02-10",died:"2022-10-05",status:"confirmed",place:"Morup",facts:[["Liv","Flyttade till Klastorp på 1950-talet"],["Avliden","2022-10-05 enligt dödsannons"]],story:["Karin Margit föds 10 februari 1929 i Morup. Hon bär flicknamnet Johansson och tar som gift namnet Bengtsson.","På 1950-talet flyttar hon med Harry Bengtsson till Klastorp. Tillsammans får de barnen Ingemar och Gerd.","Karin avlider 5 oktober 2022 enligt dödsannons."],timeline:[["1929-02-10","Föds i Morup."],["1950-talet","Flyttar med Harry Bengtsson till Klastorp."],["2022-10-05","Avlider enligt dödsannons."]],parents:["karl_hjalmar_johansson","ester_viktoria"],children:["ingemar_bengtsson","gerd_bengtsson"]},
  harry_bengtsson:{name:"Harry Bengtsson",role:"Make",born:"1916-12-22",died:"1998",status:"confirmed",place:"Klastorp",facts:[["Barn","Ingemar och Gerd Bengtsson"],["Föräldrar","Ej kartlagda i denna linje ännu"]],story:["Harry föds 22 december 1916 i Klastorp och avlider 1998."],parents:[],children:["ingemar_bengtsson","gerd_bengtsson"]},
  ingemar_bengtsson:{name:"Ingemar Bengtsson",status:"confirmed",role:"Barn",story:["Son till Karin och Harry. Grenen är ännu inte utforskad."],parents:["karin_margit","harry_bengtsson"],children:[]},
  gerd_bengtsson:{name:"Gerd Bengtsson",born:"1958-08-06",status:"confirmed",role:"Barn",facts:[["Make","Göran Nilsson"],["Barn","Axel och Ebba"]],story:["Gerd föds 6 augusti 1958, dotter till Karin och Harry.","Gerd gifter sig med Göran Nilsson. Tillsammans får de två barn: Axel och Ebba."],parents:["karin_margit","harry_bengtsson"],children:["axel_nilsson","ebba_nilsson"]},
  goran_nilsson:{name:"Göran Nilsson",role:"Make",born:"1956-05-26",status:"confirmed",facts:[["Maka","Gerd Bengtsson"],["Barn","Axel och Ebba"]],story:["Göran Nilsson föds 26 maj 1956. Han är gift med Gerd Bengtsson och tillsammans får de barnen Axel och Ebba."],parents:[],children:["axel_nilsson","ebba_nilsson"]},
  axel_nilsson:{name:"Axel Nilsson",born:"1996-01-03",status:"confirmed",role:"Bygger trädet",story:["Axel Nilsson föds 3 januari 1996, barn till Gerd Bengtsson och Göran Nilsson. Det är Axel som bygger detta släktträd."],parents:["gerd_bengtsson","goran_nilsson"],children:[]},
  ebba_nilsson:{name:"Ebba Nilsson",born:"1998-05-26",status:"confirmed",role:"Syskon",story:["Ebba Nilsson föds 26 maj 1998, barn till Gerd Bengtsson och Göran Nilsson."],parents:["gerd_bengtsson","goran_nilsson"],children:[]}
};

const UNITS = [
  {id:"u_lars_inger",gen:0,persons:["lars_esbjornsson","inger_jonsdotter"],ancestor:true,children:["u_carl_bengta"]},
  {id:"u_arvid_elin",gen:0,persons:["arvid_svensson","elin_bengtsdotter"],ancestor:true,children:["u_hans","u_anders_arfvid","u_inger_arfvid","u_bengt_arfvid","u_nils_arfvid","u_carl_bengta"]},
  {id:"u_hans",gen:1,persons:["hans_arfvidsson"],children:[]},
  {id:"u_anders_arfvid",gen:1,persons:["anders_arfvidsson"],children:[]},
  {id:"u_inger_arfvid",gen:1,persons:["inger_arfvidsdotter"],children:[]},
  {id:"u_bengt_arfvid",gen:1,persons:["bengt_arfvidsson"],children:[]},
  {id:"u_nils_arfvid",gen:1,persons:["nils_arfvidsson"],children:[]},
  {id:"u_carl_bengta",gen:1,persons:["carl_larsson","bengta_arvidsdotter"],heir:true,children:["u_anders_johanna","u_nils_carl","u_anna_lena"]},
  {id:"u_nils_carl",gen:2,persons:["nils_carlsson"],children:[]},
  {id:"u_anna_lena",gen:2,persons:["anna_lena_carlsdotter"],children:[]},
  {id:"u_anders_johanna",gen:2,persons:["anders_carlsson","johanna_svensdotter"],heir:true,children:["u_lars_august","u_sven_johan","u_christina","u_bengt_aron","u_johan_britta"]},
  {id:"u_lars_august",gen:3,persons:["lars_august"],children:[]},
  {id:"u_sven_johan",gen:3,persons:["sven_johan_andersson"],children:[]},
  {id:"u_christina",gen:3,persons:["christina_andersdotter"],children:[]},
  {id:"u_bengt_aron",gen:3,persons:["bengt_aron_andersson"],children:[]},
  {id:"u_johan_britta",gen:3,persons:["johan_andersson","britta_lovisa"],heir:true,children:["u_augusta","u_birger","u_jenny","u_karl_ester"]},
  {id:"u_augusta",gen:4,persons:["augusta_charlotta"],children:[]},
  {id:"u_birger",gen:4,persons:["birger_johansson"],children:[]},
  {id:"u_jenny",gen:4,persons:["jenny_johansson"],children:[]},
  {id:"u_karl_ester",gen:4,persons:["karl_hjalmar_johansson","ester_viktoria"],heir:true,children:["u_asta","u_elsa","u_karin_harry","u_erik","u_gosta","u_uno","u_sjunne"]},
  {id:"u_asta",gen:5,persons:["asta_linnea"],children:[]},
  {id:"u_elsa",gen:5,persons:["elsa_ingegerd"],children:[]},
  {id:"u_karin_harry",gen:5,persons:["karin_margit","harry_bengtsson"],heir:true,children:["u_ingemar","u_gerd_goran"]},
  {id:"u_erik",gen:5,persons:["erik_bertil"],children:[]},
  {id:"u_gosta",gen:5,persons:["gosta_ingemar"],children:[]},
  {id:"u_uno",gen:5,persons:["karl_john_uno"],children:[]},
  {id:"u_sjunne",gen:5,persons:["sjunne_lennart"],children:[]},
  {id:"u_ingemar",gen:6,persons:["ingemar_bengtsson"],children:[]},
  {id:"u_gerd_goran",gen:6,persons:["gerd_bengtsson","goran_nilsson"],heir:true,children:["u_axel","u_ebba"]},
  {id:"u_axel",gen:7,persons:["axel_nilsson"],heir:true,children:[]},
  {id:"u_ebba",gen:7,persons:["ebba_nilsson"],children:[]}
];

const EDGES = UNITS.flatMap(unit => (unit.children||[]).map(child => ({from:unit.id,to:child})));
const DIRECT_HEIRS = new Set(["carl_larsson","bengta_arvidsdotter","anders_carlsson","johan_andersson","karl_hjalmar_johansson","karin_margit","gerd_bengtsson","axel_nilsson"]);
const DIRECT_UNITS = new Set(["u_lars_inger","u_arvid_elin","u_carl_bengta","u_anders_johanna","u_johan_britta","u_karl_ester","u_karin_harry","u_gerd_goran","u_axel"]);
const DIRECT_EDGES = new Set([
  "u_lars_inger>u_carl_bengta",
  "u_arvid_elin>u_carl_bengta",
  "u_carl_bengta>u_anders_johanna",
  "u_anders_johanna>u_johan_britta",
  "u_johan_britta>u_karl_ester",
  "u_karl_ester>u_karin_harry",
  "u_karin_harry>u_gerd_goran",
  "u_gerd_goran>u_axel"
]);
const UNIT_BY_ID = Object.fromEntries(UNITS.map(u=>[u.id,u]));
const PERSON_TO_UNIT = {};
UNITS.forEach(u=>u.persons.forEach(pid=>{ if(!PERSON_TO_UNIT[pid]) PERSON_TO_UNIT[pid]=u.id; }));
const PARTNER = {};
UNITS.filter(u=>u.persons.length>1).forEach(u=>{ PARTNER[u.persons[0]]=u.persons[1]; PARTNER[u.persons[1]]=u.persons[0]; });

const PLACES = [
  { id:"tvaaker", name:"Tvååker", area:"Halland", lat:57.041, lng:12.400, zoom:12, aliases:["Tvååker"], note:"Socknen där flera centrala händelser i Carl-, Bengta- och Anders-ledet finns." },
  { id:"ronas", name:"Rönås", area:"Tvååker", lat:57.044, lng:12.394, zoom:14, aliases:["Rönås"], note:"Kopplat till Carl Larsson, Bengta Arvidsdotter och Anders Carlsson." },
  { id:"munkaskog", name:"Munkaskog", area:"Tvååker", lat:57.032, lng:12.410, zoom:14, aliases:["Munkaskog","Sven Börges gård","Sven Börjes gård","Svenborgsgård","Sven Börs"], note:"Central plats för Arfvid Svensson, Elin Bengtsdotter och Bengta Arvidsdotter." },
  { id:"vraen", name:"Wråen / Vråen / Wräen", area:"Tvååker", lat:57.039, lng:12.424, zoom:14, aliases:["Wråen","Vråen","Wräen","Lilla Wråen"], note:"Förekommer i Anders Carlssons arbets- och flyttspår." },
  { id:"agard", name:"Ågård", area:"Tvååker", lat:57.050, lng:12.372, zoom:14, aliases:["Ågård"], note:"Kopplas till Carl Larsson i senare liv och dödnotis." },
  { id:"galtaback", name:"Galtabäck", area:"Tvååker", lat:57.017, lng:12.336, zoom:13, aliases:["Galtabäck"], note:"Ingår i det geografiska klustret kring Tvååker." },
  { id:"grimeton", name:"Grimeton", area:"Halland", lat:57.108, lng:12.425, zoom:12, aliases:["Grimeton"], note:"Sockenområde för Carls födelsespår." },
  { id:"tjarby", name:"Tjärby", area:"Grimeton", lat:57.104, lng:12.459, zoom:14, aliases:["Tjärby"], note:"Födelseplats för Carl Larsson." },
  { id:"morup", name:"Morup", area:"Halland", lat:56.994, lng:12.392, zoom:12, aliases:["Morup"], note:"Kopplat till Karl Hjalmar Johansson och Karin Margit Johansson." },
  { id:"skillingshagen", name:"Skillingshagen", area:"Morup", lat:56.997, lng:12.383, zoom:14, aliases:["Skillingshagen","Morup No 5"], note:"Hushållsplats i Morup-ledet." },
  { id:"klastorp", name:"Klastorp", area:"Åttabro / Varberg centrum", lat:57.114, lng:12.292, zoom:15, aliases:["Klastorp"], note:"Karin och Harry flyttar hit enligt familjeuppgift. Markören är korrigerad till ungefär Åttabro vid trafikplats Varberg centrum." },
  { id:"grytas", name:"Grytås", area:"Halland", lat:57.032, lng:12.455, zoom:13, aliases:["Grytås"], note:"Johan Andersson står som dräng i Grytås vid vigseln 1874." },
  { id:"langas", name:"Långås", area:"Halland", lat:56.976, lng:12.470, zoom:13, aliases:["Långås","Långås No 3"], note:"Möjligt vigsel-/tjänstespår för Britta Lovisa Carlsdotter." }
];
