// Separata emigrantgrenar. Rotpersonen hämtas alltid från PEOPLE via rootPersonId.
// Efterkommande och grenrelationer läggs här, inte i huvudträdets FAMILY_UNITS.
const EMIGRANT_BRANCHES = {
  nils_johan_bengtsson:{
    id:"nils_johan_bengtsson",
    rootPersonId:"nils_johan_bengtsson",
    slug:"nils-johan-bengtsson",
    status:"working",
    branchLabel:"Bengtsson-ledet",
    originCountry:"Sverige",
    destinationCountry:"USA",
    destinationAreas:["Illinois","Kansas"],
    emigrationYear:"",
    emigrationConfirmed:false,
    summary:"Ett separat forskningsspår för Nils Johan Bengtsson och hans familj i USA. Rotpersonen är densamma som i personarkivet, medan efterkommande byggs ut i denna fristående gren.",
    story:[
      "Arvskiftet efter Alma Josefina Bengtsson 1955 ger ett direkt belägg för tre döttrar till Nils Johan i USA: Alice Beschel i Illinois, Edna Weltner i Kansas och Esther Sholeen i Illinois.",
      "Uppgiften visar en tydlig amerikansk familjegren men bevisar inte ensam när, hur eller ens med full säkerhet att Nils Johan själv emigrerade. Grenen hålls därför som ett källkritiskt emigrantspår tills svenska utflyttningslängder och amerikanska originalkällor har kontrollerats."
    ],
    timeline:[
      ["1955-01-12","Arvskiftet efter Alma Josefina Bengtsson namnger Nils Johans tre döttrar med adresser i Illinois och Kansas."]
    ],
    facts:[
      ["Utgångspunkt","Nils Johan Bengtsson, född 1865 enligt webbplatsens nuvarande arbetsuppgift."],
      ["Destination","USA; belagda familjespår i Illinois och Kansas år 1955."],
      ["Bevisläge","Döttrarnas bosättning är belagd i arvskiftet. Nils Johans egen emigration är ännu inte originalverifierad."],
      ["Datamodell","Rotpersonen återanvänds från personarkivet. Efterkommande och grenrelationer lagras separat från huvudträdet."]
    ],
    knownDescendants:[
      {name:"Alice Beschel",relation:"dotter",location:"Illinois, USA",status:"source-mentioned"},
      {name:"Edna Weltner",relation:"dotter",location:"Kansas, USA",status:"source-mentioned"},
      {name:"Esther Sholeen",relation:"dotter",location:"Illinois, USA",status:"source-mentioned"}
    ],
    people:{},
    families:[],
    sources:["Arvskifte efter Alma 1955.HEIC: originalutdrag ur arvskiftesinstrumentet, förrättat 1955-01-12."],
    uncertainties:[
      "Nils Johans fullständiga födelsedatum och födelseort behöver kontrolleras i svensk originalkälla.",
      "Svensk utflyttningslängd, avresedatum, fartyg och ankomsthamn är ännu inte identifierade.",
      "Nils Johans egen bosättning i USA är inte fastställd av arvskiftet.",
      "Döttrarnas namn, adresser och familjer behöver kontrolleras mot amerikanska originalkällor."
    ],
    researchFile:"emigrantgrenar/nils-johan-bengtsson.md"
  }
};
