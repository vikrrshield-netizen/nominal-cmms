export interface BuildingInspectionTemplate {
  sortOrder: number;
  building: string;
  floor: string;
  roomName: string;
  roomCode: string;
  checkPoints: string;
}

export const BUILDING_INSPECTION_TEMPLATES: BuildingInspectionTemplate[] = [
  {
    "sortOrder": 1,
    "building": "D",
    "floor": "1.NP",
    "roomName": "Údržba, mycí centrum",
    "roomCode": "D 1.25",
    "checkPoints": "odpad podlaha, kontrola dřezu (odpad , kohouty ) , hadice na vodu , vzduchové hadice,sítky v oknech,odtah VZT, celistvost soklů a zdí"
  },
  {
    "sortOrder": 2,
    "building": "D",
    "floor": "1.NP",
    "roomName": "kancelář skladník",
    "roomCode": "D 1.24",
    "checkPoints": "síť v okně , topení, celistvost soklů a zdí"
  },
  {
    "sortOrder": 3,
    "building": "D",
    "floor": "1.NP",
    "roomName": "expedice",
    "roomCode": "D1.23",
    "checkPoints": "trubky topení (poškození,hmyzolapače,vrata 4 x,rozvaděč , hasící přístroje, celistvost soklů a zdí"
  },
  {
    "sortOrder": 4,
    "building": "D",
    "floor": "1.NP",
    "roomName": "Výtah expedice",
    "roomCode": "",
    "checkPoints": "poškození kabiny ,spára před výtahem,poškození dveří"
  },
  {
    "sortOrder": 5,
    "building": "D",
    "floor": "1.NP",
    "roomName": "WC řidiči",
    "roomCode": "D 1.21",
    "checkPoints": "kontrola vlhoksti, umývadlo (opdad , kohoutek),WC , celistvost soklů a zdí"
  },
  {
    "sortOrder": 6,
    "building": "D",
    "floor": "1.NP",
    "roomName": "WC expedice",
    "roomCode": "D 1.22",
    "checkPoints": "kontrola vlhoksti, umývadlo (opdad , kohoutek),WC , celistvost soklů a zdí"
  },
  {
    "sortOrder": 7,
    "building": "D",
    "floor": "1.NP",
    "roomName": "úklidovka expedice",
    "roomCode": "D 1.18",
    "checkPoints": "Bojler,haidice u bojleru k napouštění mycího stroje,expanzní nádrž,výlevka, rozvod vodoinstalace, celistvost soklů a zdí"
  },
  {
    "sortOrder": 8,
    "building": "D",
    "floor": "1.NP",
    "roomName": "odpadová místnost",
    "roomCode": "D 1.17",
    "checkPoints": "úklid , mřížky ve zdi, celistvost soklů a zdí"
  },
  {
    "sortOrder": 9,
    "building": "D",
    "floor": "1.NP",
    "roomName": "u Agáty",
    "roomCode": "D1.13a",
    "checkPoints": "3x vzduchová hadice ,síť v okně , rolety,průchody stropem, celistvost soklů a zdí"
  },
  {
    "sortOrder": 10,
    "building": "D",
    "floor": "1.NP",
    "roomName": "U kartonovačky",
    "roomCode": "D1.13",
    "checkPoints": "9x vzduchové hadice,3x síť v okně,rolety ,topení ,elekt. Rozvody , VZT odtah ,přívod,průchod stropem 2x,Rozvodna el.,čidlo VZT, celistvost soklů a zdí"
  },
  {
    "sortOrder": 11,
    "building": "D",
    "floor": "1.NP",
    "roomName": "Uklidovka u kartonovačky",
    "roomCode": "D1.9",
    "checkPoints": "Bojler,expanzní nádrž,výlevka,umyvadlo,dávkovač 2x,dávkovač papíru kontrola funkce a dobití baterii, celistvost soklů a zdí"
  },
  {
    "sortOrder": 12,
    "building": "D",
    "floor": "1.NP",
    "roomName": "Kancelář Vedoucí výroby",
    "roomCode": "D1.12",
    "checkPoints": "2x síť v okně,2x rolety,čidlo VZT, celistvost soklů a zdí"
  },
  {
    "sortOrder": 13,
    "building": "D",
    "floor": "1.NP",
    "roomName": "Chodba u kotelny",
    "roomCode": "D1.02",
    "checkPoints": "2x vrata ,čidlo VZT , rozvody vody ,vzduchu (žlaby),hydrant,nabíječky,"
  },
  {
    "sortOrder": 14,
    "building": "D",
    "floor": "1.NP",
    "roomName": "Výtah Extrudovny",
    "roomCode": "D1.06",
    "checkPoints": "poškození kabiny, spára pod výtahem, poškození dveří"
  },
  {
    "sortOrder": 15,
    "building": "D",
    "floor": "1.NP",
    "roomName": "Sklad pod schody",
    "roomCode": "D1.02",
    "checkPoints": "vlhkost, pořádek, zamykání dveří, celistvost soklů a zdí"
  },
  {
    "sortOrder": 16,
    "building": "D",
    "floor": "1.NP",
    "roomName": "Sklad vzorků",
    "roomCode": "D1.06",
    "checkPoints": "zámek u dveří, VZT, čidla VZT, odpadní trubky, celistvost soklů a zdí"
  },
  {
    "sortOrder": 17,
    "building": "D",
    "floor": "1.NP",
    "roomName": "Prádelna",
    "roomCode": "D1.08",
    "checkPoints": "VZT - odtah kontrola funkčnnosti, dřez, odpady u praček, celistvost soklů a zdí"
  },
  {
    "sortOrder": 18,
    "building": "C",
    "floor": "1.NP",
    "roomName": "Denní místnost",
    "roomCode": "C1.18",
    "checkPoints": "VZT, síťka v okně, topení, odpad u dřezu, celistvost soklů a zdí"
  },
  {
    "sortOrder": 19,
    "building": "C",
    "floor": "1.NP",
    "roomName": "Chodba šatny směr A",
    "roomCode": "C1.03",
    "checkPoints": "VZT, hmyzolapač, hasičák, hydrant, skříňka návštěvy, celistvost soklů a zdí"
  },
  {
    "sortOrder": 20,
    "building": "C",
    "floor": "1.NP",
    "roomName": "Uklidová místnost",
    "roomCode": "C1.05",
    "checkPoints": "VZT, celistvost soklů a zdí"
  },
  {
    "sortOrder": 21,
    "building": "C",
    "floor": "1.NP",
    "roomName": "Šatna ženy",
    "roomCode": "C1.17/C1.13",
    "checkPoints": "topení, umyvadla, WC, sprchové kouty, VZT, celistvost soklů a zdí"
  },
  {
    "sortOrder": 22,
    "building": "D",
    "floor": "1.NP",
    "roomName": "Sklad vedle vzorků",
    "roomCode": "D.05",
    "checkPoints": "zatékání z VZT, celistvost soklů a zdí"
  },
  {
    "sortOrder": 23,
    "building": "D",
    "floor": "1.NP",
    "roomName": "Sklad čistého prádla",
    "roomCode": "D.06",
    "checkPoints": "zatékání z VZT, celistvost soklů a zdí"
  },
  {
    "sortOrder": 24,
    "building": "C",
    "floor": "1.NP",
    "roomName": "Šatna Muži",
    "roomCode": "C1.07",
    "checkPoints": "topení, umyvadla, WC, sprchové kouty, VZT, celistvost soklů a zdí"
  },
  {
    "sortOrder": 25,
    "building": "C",
    "floor": "1.NP",
    "roomName": "Baterkárna Fve",
    "roomCode": "C.01",
    "checkPoints": "rozvody vody, rozvaděč, klimatizace, baterie VZT, celistvost soklů a zdí"
  },
  {
    "sortOrder": 26,
    "building": "C",
    "floor": "1.NP",
    "roomName": "Místnost s Bojlerem",
    "roomCode": "C1.02",
    "checkPoints": "expanzní nádoba, bojler, celistvost soklů a zdí"
  },
  {
    "sortOrder": 27,
    "building": "C",
    "floor": "1.NP",
    "roomName": "WC C",
    "roomCode": "C1.03",
    "checkPoints": "umyvadlo, WC, celistvost soklů a zdí"
  },
  {
    "sortOrder": 28,
    "building": "C",
    "floor": "1.NP",
    "roomName": "Chodba C",
    "roomCode": "",
    "checkPoints": "kontrola celistvosti dřevěného stropu, celistvost soklů a zdí"
  },
  {
    "sortOrder": 29,
    "building": "D",
    "floor": "1.NP",
    "roomName": "Vstup D",
    "roomCode": "",
    "checkPoints": "vedení vody a topení"
  },
  {
    "sortOrder": 30,
    "building": "D",
    "floor": "1.NP",
    "roomName": "Kotelna",
    "roomCode": "D1.01",
    "checkPoints": "síťky v oknech, čidlo VZT, vzduchová hadice, umyvadlo, zámek u vrat, celistvost soklů a zdí"
  },
  {
    "sortOrder": 31,
    "building": "D",
    "floor": "1.NP",
    "roomName": "Sklad surovin",
    "roomCode": "D1.15",
    "checkPoints": "topení, zatékání  po dešti, kontrola regálů, vrata, akumulační nádrž, filtr chlazení motoru ex.4, hmyzolapač, čidla, VZT, klimatizace, police, celistvost soklů a zdí, okna střecha"
  },
  {
    "sortOrder": 32,
    "building": "D",
    "floor": "1.NP",
    "roomName": "Sklad hotové výrobky",
    "roomCode": "D1.14",
    "checkPoints": "požárná clony, VZT, topení, kontrola regálů, střecha, balkonek, celistvost soklů a zdí, okna střecha"
  },
  {
    "sortOrder": 33,
    "building": "D",
    "floor": "2.NP",
    "roomName": "schodiště expedice",
    "roomCode": "",
    "checkPoints": "zábradlí, polep schodů, celistvost soklů a zdí"
  },
  {
    "sortOrder": 34,
    "building": "D",
    "floor": "2.NP",
    "roomName": "Chodba u výtahu",
    "roomCode": "D2.11",
    "checkPoints": "kontrola poškození regálu, hydrant, spára před výtahem, celistvost soklů a zdí"
  },
  {
    "sortOrder": 35,
    "building": "D",
    "floor": "2.NP",
    "roomName": "Sklad obalů",
    "roomCode": "D2.12",
    "checkPoints": "kontrola regálů, VZT čidla, hasičák, okna střecha, celistvost soklů a zdí"
  },
  {
    "sortOrder": 36,
    "building": "D",
    "floor": "2.NP",
    "roomName": "Sklad Extrudátu",
    "roomCode": "D2.1",
    "checkPoints": "kontrola regálů, VZT čidla, hasičák, okna střecha, celistvost soklů a zdí, dřez, bojler pod dřezem, rozvaděč, hasičáky"
  },
  {
    "sortOrder": 37,
    "building": "D",
    "floor": "2.NP",
    "roomName": "Míchárna II.",
    "roomCode": "D2.092",
    "checkPoints": "VZT, vzduchová hadice, signalizace, skříňka, celistvost soklů a zdí"
  },
  {
    "sortOrder": 38,
    "building": "D",
    "floor": "2.NP",
    "roomName": "Míchárna I.",
    "roomCode": "D2.091",
    "checkPoints": "VZT, vzduchová hadice, signalizace, skříňka, celistvost soklů a zdí"
  },
  {
    "sortOrder": 39,
    "building": "D",
    "floor": "2.NP",
    "roomName": "Extrudovna 1",
    "roomCode": "D2.08",
    "checkPoints": "vzduchové hadice, topení, olejové topení, voda, VZT, čidlo, vzduchový rukáv, klapky, elektrické rozvody u šroťáku, filtry v rozvaděčích, skříňka, celistvost soklů a zdí"
  },
  {
    "sortOrder": 40,
    "building": "D",
    "floor": "2.NP",
    "roomName": "denní místnost",
    "roomCode": "D2.07",
    "checkPoints": "síť v okně, dře, topení, stůl, lednice, prodlužka, celistvost soklů a zdí"
  },
  {
    "sortOrder": 41,
    "building": "D",
    "floor": "2.NP",
    "roomName": "WC",
    "roomCode": "D2.06",
    "checkPoints": "umyvadlo, WC, celistvost soklů a zdí, bateriový dávkovač ručníků"
  },
  {
    "sortOrder": 42,
    "building": "D",
    "floor": "2.NP",
    "roomName": "Chodba Ex.",
    "roomCode": "D2.02",
    "checkPoints": "kontrola regálů, VZT klapky, topení, hydrant, ceistvost soklů a zdí"
  },
  {
    "sortOrder": 43,
    "building": "D",
    "floor": "2.NP",
    "roomName": "Úklidovka",
    "roomCode": "D2.05",
    "checkPoints": "výlevka, skříň, VZT, celistvost soklů a zdí"
  },
  {
    "sortOrder": 44,
    "building": "D",
    "floor": "2.NP",
    "roomName": "El. ozvodna",
    "roomCode": "D2.04",
    "checkPoints": "VZT, rozvaděč"
  },
  {
    "sortOrder": 45,
    "building": "D",
    "floor": "2.NP",
    "roomName": "Extrudovna 2.",
    "roomCode": "D2.01",
    "checkPoints": "vzduchové hadice, topení, olejové topení, voda, VZT, čidlo, vzduchový rukáv, klapky, elektrické rozvody u šroťáku, filtry v rozvaděčích, skříňka, celistvost soklů a zdí, schody k nautě, síť v okně"
  },
  {
    "sortOrder": 46,
    "building": "D",
    "floor": "3.NP",
    "roomName": "vzt",
    "roomCode": "D2.03",
    "checkPoints": "zanešení filtrů VZT, filtry v rozvaděči"
  }
];
