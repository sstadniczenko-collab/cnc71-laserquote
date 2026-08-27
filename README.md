# CNC71 — LaserQuote

Wycena cięcia laserem online. Klient wrzuca **DXF**, wybiera materiał i grubość,
dostaje cenę w kilka sekund i wysyła zapytanie mailem.

Wzorowane funkcjonalnie na [laserquote.laserem-ciecie.pl](https://laserquote.laserem-ciecie.pl/)
(Staffa.pl) — model kosztowy jest branżowym standardem (materiał + gaz + prąd +
maszynogodzina + przebicia + ustawienie), kod napisany od zera.

## Jak to działa

Wszystko liczy się **w przeglądarce klienta** — plik DXF nigdzie nie wychodzi.
Dzięki temu całość stoi na GitHub Pages, bez backendu, bez bazy, bez kosztów.

```
DXF → parser (LINE/ARC/CIRCLE/LWPOLYLINE/POLYLINE/SPLINE/ELLIPSE)
    → długość cięcia + liczba konturów (= przebić) + gabaryt
    → czas cięcia = długość / prędkość(materiał, grubość)
    → koszt = materiał + gaz + prąd + maszyna + przebicia + ustawienie
    → × marża × priorytet → netto → VAT → brutto
```

Rzeczy, które robi ten tool, a które łatwo przeoczyć:

- czyta `$INSUNITS` z nagłówka DXF i sam ustawia jednostkę (mm / cm / cal / stopa / metr),
- **pomija linie osiowe i kreskowe** (CENTER, HIDDEN, DASHED, PHANTOM…) — nie liczą się do ceny,
- pozwala ręcznie odznaczyć dowolną warstwę / typ linii (np. opis, wymiarowanie),
- liczy przebicia przez sklejanie encji po końcach (union-find, tolerancja 0,02 j.),
- ostrzega: detal większy niż stół 3000×1500 (format RZ1530FBC), detal < 20 mm (mikrozłącza), poniżej minimum zlecenia,
- masa detalu z gabarytu × grubość × gęstość (bez nestingu — czyli **z zapasem**, jak u konkurencji).

## Kalibracja — [`cennik.js`](cennik.js)

To jedyny plik do zmiany. Wartości, które **trzeba** przestawić przed startem:

| Pole | Teraz | Co z tym zrobić |
|---|---|---|
| `mocFactor` | `1.0` | Tabela prędkości jest dla lasera ~3 kW, tniemy na **Razortek RZ1530FBC 12 kW** → realnie ok. **1.8–2.5**. Zostawione na 1.0 celowo: zaniżona prędkość zawyża cenę, czyli myli się w bezpieczną stronę. Kalibracja: wytnij znany detal, zmierz czas stoperem, porównaj z polem „Czas cięcia" i podziel. |
| `materialy[*].plnKg` | ceny orientacyjne | Wstawić realne ceny zakupu blachy /kg. |
| `machMin` | `3.50` zł/min | Maszynogodzina / 60 (amortyzacja + serwis + obsługa). |
| `elecMin` | `0.30` zł/min | Pobór (laser + chiller + odciąg) × stawka za kWh / 60. |
| `setupFee` | `40` zł | Programowanie + rozładunek, raz na pozycję. |
| `marza` | `30 %` | Narzut na koszt techniczny. |
| `minZlecenie` | `150` zł | Minimum netto; `0` = wyłączone. |
| `email`, `tel` | placeholder | Adres, na który idzie zapytanie. |

Gaz i koszt przebicia (`gazPrzebicie`) są realistyczne dla tlenu (stal czarna)
i azotu (nierdzewka / alu) — ruszać dopiero po pierwszych rozliczeniach.

## Test

```bash
node test/smoke.mjs
```

Parsuje `test/plytka.dxf` (prostokąt 100×50 + otwór Ø20 + linia osiowa do pominięcia)
i sprawdza długość cięcia, liczbę przebić, gabaryt i masę. Bez przeglądarki —
`app.js` jest ładowany w `vm` na atrapach DOM.

## Live

**https://sstadniczenko-collab.github.io/cnc71-laserquote/**

Repo jest **publiczne** — tego wymaga GitHub Pages na darmowym planie. Dla
poufności stawek nie zmienia to praktycznie nic: skoro wycena liczy się w
przeglądarce klienta, zawartość `cennik.js` i tak trafia do niego i widać ją w
devtools — dokładnie jak u konkurencji. Jedyny sposób, żeby stawki zostały
nieujawnione, to własny backend liczący cenę po stronie serwera.

## Uruchomienie lokalnie

```bash
python -m http.server 8000     # albo: npx serve .
# → http://localhost:8000
```

(Otwarcie `index.html` przez `file://` też działa — nie ma żadnego fetcha.)

## Czego to NIE robi

Świadomie okrojone względem pierwowzoru, bo GitHub Pages nie ma backendu:

- brak koszyka wielu detali, płatności online (Przelewy24) i śledzenia zlecenia,
- brak konwersji DWG → DXF i wektoryzacji zdjęć przez AI,
- brak wysyłki / paczkomatów,
- zapytanie idzie przez `mailto:` — klient **dokłada plik DXF ręcznie**.

Jeśli któraś z tych rzeczy okaże się potrzebna, to moment na własny backend
(albo formularz w panelu cnc71) — nie na rozbudowę statycznej strony.
