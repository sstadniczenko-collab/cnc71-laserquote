/* ============================================================================
   CNC71 — LaserQuote :: CENNIK / PARAMETRY
   ----------------------------------------------------------------------------
   To jedyny plik, który zmieniasz żeby przestroić wycenę.
   Nic tu nie jest tajne — plik leci do przeglądarki klienta, więc NIE wpisuj
   tu kosztów wewnętrznych, których nie chcesz pokazać (klient zobaczy rozbicie
   na materiał / cięcie / ustawienie, ale nie zobaczy samych stawek dopóki
   nie otworzy źródła — a otworzy, jeśli będzie chciał).
   ==========================================================================*/

const CFG = {

  firma:  'CNC71',
  email:  'biuro@cnc71.pl',       // << POTWIERDZIĆ
  tel:    '',                     // << UZUPEŁNIĆ
  www:    'https://cnc71.pl',

  /* --- MASZYNA -------------------------------------------------------------
     Maszyna: Razortek RZ1530FBC, 12 kW, stół 3000 × 1500 mm.
     Tabela prędkości cięcia w mm/min jest dla lasera referencyjnego ~3 kW.
     12 kW jest DUŻO szybszy — zamiast przepisywać całą tabelę, podkręć
     mnożnik `mocFactor`. Zostawiony na 1.0 CELOWO: zaniżona prędkość =
     zawyżona cena, czyli błąd w bezpieczną stronę do czasu kalibracji. Kalibracja: wytnij jeden znany detal,
     zmierz czas, porównaj z 'Czas cięcia' pokazywanym przez tool.
     ---------------------------------------------------------------------- */
  mocFactor: 1.0,                 // << SKALIBROWAĆ (12 kW vs 3 kW ≈ 1.8–2.5)

  speedTable: {
    steel: {1:7500, 1.5:6000, 2:5000, 3:4200, 4:3700, 5:3300, 6:2600, 8:2000, 10:1300, 12:1050, 15:800, 20:450},
    s355:  {1:7000, 1.5:5500, 2:4000, 3:2500, 4:1800, 5:1300, 6:900,  8:600,  10:450,  12:300,  15:220, 20:130},
    ss304: {1:4500, 1.5:3500, 2:2700, 3:1800, 4:1200, 5:900,  6:600,  8:430,  10:300,  12:220,  15:150, 20:90},
    ss316: {1:4200, 1.5:3300, 2:2500, 3:1650, 4:1100, 5:820,  6:550,  8:390,  10:270,  12:200,  15:135, 20:80},
    alu:   {1:9000, 1.5:7000, 2:5500, 3:3500, 4:2500, 5:1800, 6:1200, 8:800,  10:600,  12:400,  15:280, 20:180},
  },

  /* Koszt gazu [PLN/min] + koszt jednego przebicia [PLN/przebicie].
     Stal czarna = tlen (tanio). Nierdzewka / alu = azot (drogo, rośnie z grubością). */
  gazPrzebicie: {
    steel: {1:{gas:0.15,p:0.008}, 1.5:{gas:0.15,p:0.013}, 2:{gas:0.15,p:0.013}, 3:{gas:0.15,p:0.013}, 4:{gas:0.15,p:0.013}, 5:{gas:0.15,p:0.013}, 6:{gas:0.15,p:0.013}, 8:{gas:0.15,p:0.013}, 10:{gas:0.15,p:0.013}, 12:{gas:0.15,p:0.013}, 15:{gas:0.15,p:0.013}, 20:{gas:0.15,p:0.013}},
    s355:  {1:{gas:0.15,p:0.008}, 1.5:{gas:0.15,p:0.013}, 2:{gas:0.15,p:0.013}, 3:{gas:0.15,p:0.013}, 4:{gas:0.15,p:0.013}, 5:{gas:0.15,p:0.013}, 6:{gas:0.15,p:0.013}, 8:{gas:0.15,p:0.013}, 10:{gas:0.15,p:0.013}, 12:{gas:0.15,p:0.013}, 15:{gas:0.15,p:0.013}, 20:{gas:0.15,p:0.013}},
    ss304: {1:{gas:3.66,p:0.015}, 1.5:{gas:3.66,p:0.026}, 2:{gas:3.66,p:0.038}, 3:{gas:3.66,p:0.053}, 4:{gas:3.66,p:0.068}, 5:{gas:4.35,p:0.095}, 6:{gas:4.35,p:0.108}, 8:{gas:5.03,p:0.142}, 10:{gas:5.70,p:0.229}, 12:{gas:6.41,p:0.363}, 15:{gas:7.03,p:0.591}, 20:{gas:8.02,p:1.183}},
    ss316: {1:{gas:3.66,p:0.015}, 1.5:{gas:3.66,p:0.026}, 2:{gas:3.66,p:0.038}, 3:{gas:3.66,p:0.053}, 4:{gas:3.66,p:0.068}, 5:{gas:4.35,p:0.095}, 6:{gas:4.35,p:0.108}, 8:{gas:5.03,p:0.142}, 10:{gas:5.70,p:0.229}, 12:{gas:6.41,p:0.363}, 15:{gas:7.03,p:0.591}, 20:{gas:8.02,p:1.183}},
    alu:   {1:{gas:3.66,p:0.015}, 1.5:{gas:3.66,p:0.026}, 2:{gas:3.66,p:0.038}, 3:{gas:3.66,p:0.053}, 4:{gas:3.66,p:0.068}, 5:{gas:4.35,p:0.095}, 6:{gas:4.35,p:0.108}, 8:{gas:5.03,p:0.142}, 10:{gas:5.70,p:0.229}, 12:{gas:6.41,p:0.363}, 15:{gas:7.03,p:0.591}, 20:{gas:8.02,p:1.183}},
  },

  /* --- MATERIAŁ ---------------------------------------------------------- */
  materialy: {
    steel: {nazwa:'Stal czarna (DC01)',            gestosc:7850, plnKg: 5.50},  // << CENY DO POTWIERDZENIA
    s355:  {nazwa:'Stal konstrukcyjna (S355)',     gestosc:7850, plnKg: 5.20},
    ss304: {nazwa:'Nierdzewna (1.4301 / SS304)',   gestosc:7930, plnKg:14.50},
    ss316: {nazwa:'Kwasoodporna (1.4404 / SS316L)',gestosc:7980, plnKg:19.00},
    alu:   {nazwa:'Aluminium (EN AW-5754)',        gestosc:2700, plnKg:16.00},
  },

  grubosci: [1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20],

  /* Grubości chwilowo niedostępne, np. {ss316:[15,20]} */
  niedostepne: {},

  /* --- STAWKI ------------------------------------------------------------- */
  machMin:  3.50,   // PLN/min pracy maszyny (amortyzacja+serwis+obsługa)  << SKALIBROWAĆ
  elecMin:  0.30,   // PLN/min prądu (laser+chiller+odciąg)                << SKALIBROWAĆ
  setupFee: 40,     // PLN, jednorazowo od pozycji (programowanie, rozładunek)
  marza:    30,     // % narzutu na koszt techniczny
  vat:      23,     // %

  /* Narzut za pilność (mnożnik ceny netto) */
  priorytety: {
    normal:  {label:'Standard',  mult:1.00, opis:'termin wg kolejki'},
    pilne:   {label:'Pilne',     mult:1.20, opis:'+20%'},
    express: {label:'Express',   mult:1.50, opis:'+50%'},
  },

  /* Minimalna wartość zlecenia netto (przed VAT). 0 = wyłączone. */
  minZlecenie: 150,

  /* Maksymalny detal — format stołu Razortek RZ1530FBC = 3000 × 1500 mm */
  maxDetal: {x:3000, y:1500},
};
