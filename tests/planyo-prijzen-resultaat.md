# Planyo prijstest

Gedraaid op 1-10-2026, 09:49:05 · site 70822 · alleen prijzen opgevraagd, niets geboekt.

**11 OK · 4 AFWIJKING · 0 ONTBREEKT**

| Nr | Omschrijving | Verwacht | Planyo | Uitkomst |
|---:|---|---:|---:|---|
| 1 | Day Stay 3 uur, 2 personen | € 249,00 | € 249,00 | **OK** |
| 2 | Day Stay 4 uur, 3 volw. + 1 kind (5 jr) | € 354,00 | € 341,00 | **AFWIJKING** |
| 3 | Day Stay 3 uur, 4 volw. + lunch voor 4 | € 447,00 | € 447,00 | **OK** |
| 4 | Day Stay 3 uur, 4 volw. + verjaardagsarrangement | € 454,00 | € 454,00 | **OK** |
| 5 | Overnight di, check-in 20:00, 2 pers. | € 399,00 | € 399,00 | **OK** |
| 6 | Overnight za, check-in 20:00, 2 pers. | € 449,00 | € 449,00 | **OK** |
| 7 | Overnight do, check-in 13:00 (weekendtarief) | € 529,00 | € 529,00 | **OK** |
| 8 | Overnight ma, check-in 13:00 + uitchecken 12:00 | € 499,00 | € 499,00 | **OK** |
| 9 | Overnight za 20:00, 3 volwassenen | € 549,00 | € 549,00 | **OK** |
| 10 | Overnight di 20:00, 2 volw. + baby (1 jr) | € 399,00 | € 399,00 | **OK** |
| 11 | Overnight Bruidsnacht za, check-in 01:00 | € 849,00 | € 449,00 | **AFWIJKING** |
| 12 | Overnight Bruidsnacht di: mag NIET boekbaar zijn | niet boekbaar | boekbaar, € 399,00 | **AFWIJKING** |
| 13 | Overnight di 20:00 + 3 burgermenu's + 2 prosecco | € 576,00 | € 576,00 | **OK** |
| 14 | Overnight za 20:00 + VIP-arrangement | € 699,00 | € 699,00 | **OK** |
| 15 | Overnight 7 nachten ma 16-11 t/m ma 23-11, 20:00, 2 pers. | € 2.843,35 | € 2.993,00 | **AFWIJKING** |

## Toelichting per testgeval

- **1. Day Stay 3 uur, 2 personen** — OK
  - Gevraagd: `start_time=2026-11-10 12:00`, `end_time=2026-11-10 15:00`, `adults=2`
  - Opbouw Planyo: basisprijs: € 249,00
- **2. Day Stay 4 uur, 3 volw. + 1 kind (5 jr)** — AFWIJKING. Planyo rekent € 13,00 te weinig
  - Gevraagd: `start_time=2026-11-10 12:00`, `end_time=2026-11-10 16:00`, `adults=3`, `Kinderen__2_12_jaar=1`
  - Opbouw Planyo: basisprijs: € 249,00 + Additional adults present: Aantal volwassenen: >2 (regel 15): € 60,00 + Kinderen (2-12 jaar (regel 16): € 25,00 + Kinderen (2-12 jaar (regel 47): € 7,00
- **3. Day Stay 3 uur, 4 volw. + lunch voor 4** — OK
  - Gevraagd: `start_time=2026-11-10 12:00`, `end_time=2026-11-10 15:00`, `adults=4`, `Lunch=Standaard`, `Lunch___aantal_personen=4 personen`
  - Opbouw Planyo: basisprijs: € 249,00 + Additional adults present: Aantal volwassenen: >2 (regel 15): € 120,00 + Lunch - aantal personen = 4 personen (regel 42): € 78,00
- **4. Day Stay 3 uur, 4 volw. + verjaardagsarrangement** — OK
  - Gevraagd: `start_time=2026-11-10 12:00`, `end_time=2026-11-10 15:00`, `adults=4`, `Verjaardag_arrangement=yes`
  - Opbouw Planyo: basisprijs: € 249,00 + Additional adults present: Aantal volwassenen: >2 (regel 15): € 120,00 + Verjaardag arrangement = yes (regel 19): € 75,00 + Additional adults present: Aantal volwassenen: >2 (regel 23): € 10,00
- **5. Overnight di, check-in 20:00, 2 pers.** — OK
  - Gevraagd: `start_time=2026-11-10`, `end_time=2026-11-11`, `Inchecktijd=20:00 - Standaard`, `adults=2`
  - Opbouw Planyo: Always true: Monday to Thursday Price (regel 4): € 399,00
- **6. Overnight za, check-in 20:00, 2 pers.** — OK
  - Gevraagd: `start_time=2026-11-14`, `end_time=2026-11-15`, `Inchecktijd=20:00 - Standaard`, `adults=2`
  - Opbouw Planyo: Always true: Friday to Monday Price (regel 5): € 449,00
- **7. Overnight do, check-in 13:00 (weekendtarief)** — OK
  - Gevraagd: `start_time=2026-11-12`, `end_time=2026-11-13`, `Inchecktijd=13:00 - Early check-in`
  - Opbouw Planyo: Always true: Friday to Monday Price (regel 5): € 449,00 + Inchecktijd = 13:00 - Early check-in (regel 7): € 80,00
- **8. Overnight ma, check-in 13:00 + uitchecken 12:00** — OK
  - Gevraagd: `start_time=2026-11-16`, `end_time=2026-11-17`, `Inchecktijd=13:00 - Early check-in`, `Uitchecktijd=12:00 - Laat uitchecken (+ EUR 50)`
  - Opbouw Planyo: Always true: Monday to Thursday Price (regel 4): € 399,00 + Inchecktijd = 13:00 - Early check-in (regel 6): € 50,00 + Uitchecktijd = 12:00 - Laat uitchecken (+ EUR 50) (regel 8): € 50,00
- **9. Overnight za 20:00, 3 volwassenen** — OK
  - Gevraagd: `start_time=2026-11-14`, `end_time=2026-11-15`, `Inchecktijd=20:00 - Standaard`, `adults=3`
  - Opbouw Planyo: Always true: Friday to Monday Price (regel 5): € 449,00 + Additional adults present: Aantal volwassenen: >2 (regel 15): € 100,00
- **10. Overnight di 20:00, 2 volw. + baby (1 jr)** — OK
  - Gevraagd: `start_time=2026-11-10`, `end_time=2026-11-11`, `Inchecktijd=20:00 - Standaard`, `adults=2`, `Baby_s_en_peuters_0_1_jaar=1`
  - Opbouw Planyo: Always true: Monday to Thursday Price (regel 4): € 399,00
- **11. Overnight Bruidsnacht za, check-in 01:00** — AFWIJKING. Planyo rekent € 400,00 te weinig
  - Gevraagd: `start_time=2026-11-14`, `end_time=2026-11-15`, `Inchecktijd=01:00 - Bruidsnacht Arrangement`, `Honeymoon_overnachting=yes`
  - Opbouw Planyo: Always true: Friday to Monday Price (regel 5): € 449,00
- **12. Overnight Bruidsnacht di: mag NIET boekbaar zijn** — AFWIJKING. Planyo laat deze boeking gewoon toe
  - Gevraagd: `start_time=2026-11-10`, `end_time=2026-11-11`, `Inchecktijd=01:00 - Bruidsnacht Arrangement`, `Honeymoon_overnachting=yes`
  - Opbouw Planyo: Always true: Monday to Thursday Price (regel 4): € 399,00
- **13. Overnight di 20:00 + 3 burgermenu's + 2 prosecco** — OK
  - Gevraagd: `start_time=2026-11-10`, `end_time=2026-11-11`, `Inchecktijd=20:00 - Standaard`, `Burgermenu=Black angus beef`, `Burgermenu___aantal_personen=3`, `Wijn_of_prosecco=Prosecco`, `Wijn_of_prosecco___aantal_flessen=2`
  - Opbouw Planyo: Always true: Monday to Thursday Price (regel 4): € 399,00 + Burgermenu - aantal personen (regel 43): € 117,00 + Wijn of prosecco - aantal flessen (regel 53): € 60,00
- **14. Overnight za 20:00 + VIP-arrangement** — OK
  - Gevraagd: `start_time=2026-11-14`, `end_time=2026-11-15`, `Inchecktijd=20:00 - Standaard`, `VIP_Arrangement=yes`
  - Opbouw Planyo: Always true: Friday to Monday Price (regel 5): € 449,00 + VIP Arrangement = yes (regel 28): € 250,00
- **15. Overnight 7 nachten ma 16-11 t/m ma 23-11, 20:00, 2 pers.** — AFWIJKING. Planyo rekent € 149,65 te veel
  - Gevraagd: `start_time=2026-11-16`, `end_time=2026-11-23`, `Inchecktijd=20:00 - Standaard`, `adults=2`
  - Opbouw Planyo: Always true: Monday to Thursday Price (regel 4): € 1.197,00 + Always true: Friday to Monday Price (regel 5): € 1.796,00

## Formulieropties

```
Resource 251803 — B&W Angie Wellness Suite- Dagverblijf
  Starttijden: 12:00, 12:30, 13:00 | duur 3 t/m 5 uur | basisprijs € 249
  - Aantal volwassenen [adults] — aantal: 2 | 3 | 4  (standaard: 2)
  - Kinderen 2 12 jaar [Kinderen__2_12_jaar] — keuzelijst: 0 | 1 | 2
  - Baby s en peuters 0 1 jaar [Baby_s_en_peuters_0_1_jaar] — keuzelijst: 0 | 1 | 2
  - All inclusive arrangementen [All_inclusive_arrangementen] — aanvinkvak  (standaard: yes)
  - Verjaardag arrangement [Verjaardag_arrangement] — aanvinkvak  (standaard: no)
  - Verjaardag deluxe arrangement [Verjaardag_deluxe_arrangement] — aanvinkvak  (standaard: no)
  - Romantisch arrangement [Romantisch_arrangement] — aanvinkvak  (standaard: no)
  - VIP Arrangement [VIP_Arrangement] — aanvinkvak  (standaard: no)
  - VIP menukeuze [VIP_menukeuze] — keuzelijst: Sushi schaal (voor 2 pers.) | Burgermenu (voor 2 pers.)
  - 365 Valentine Romantisch deluxe [365_Valentine__Romantisch_deluxe] — aanvinkvak  (standaard: no)
  - Bridal Babyshower arrangement [Bridal_____Babyshower_arrangement] — aanvinkvak  (standaard: no)
  - Kidspool party arrangement [Kidspool_party_arrangement] — aanvinkvak  (standaard: no)
  - Ontbijt [Ontbijt] — keuzelijst: 2 personen | 3 personen | 4 personen
  - Luxe champagne ontbijt [Luxe_champagne_ontbijt] — aanvinkvak  (standaard: no)
  - Lunch [Lunch] — keuzelijst: Standaard | Vegetarisch | Halal
  - Lunch aantal personen [Lunch___aantal_personen] — keuzelijst: 2 personen | 3 personen | 4 personen
  - Burgermenu [Burgermenu] — keuzelijst: Black angus beef | Crispy chicken | Vega burger
  - Burgermenu aantal personen [Burgermenu___aantal_personen] — keuzelijst: 1 | 2 | 3 | 4
  - Deluxe menu [Deluxe_menu] — aanvinkvak  (standaard: no)
  - Chicken platter [Chicken_platter] — aanvinkvak  (standaard: no)
  - Warme borrelplank [Warme_borrelplank] — keuzelijst: 0 | 1 | 2 | 3  (standaard: 0)
  - Charcuterie Board warme en koude tapas [Charcuterie_Board___warme_en_koude_tapas_] — keuzelijst: 0 | 1 | 2 | 3  (standaard: 0)
  - Sushi Experience [Sushi_Experience] — aanvinkvak  (standaard: no)
  - High Tea [High_Tea] — aanvinkvak  (standaard: no)
  - Tasting tree experience [Tasting_tree_experience] — aanvinkvak  (standaard: no)
  - Fruitschaal [Fruitschaal] — aanvinkvak  (standaard: no)
  - Mocktail Karaf [Mocktail_Karaf] — keuzelijst: Pina Colada | Mojito | Passionfruit Martini
  - Wijn of prosecco [Wijn_of_prosecco] — keuzelijst: Prosecco | Chardonnay | Zoet witte wijn | Rode wijn
  - Wijn of prosecco aantal flessen [Wijn_of_prosecco___aantal_flessen] — keuzelijst: 1 | 2 | 3 | 4
  - Moet en Chandon Ice Edition [Moet_en_Chandon_Ice_Edition] — aanvinkvak  (standaard: no)
  - Eigen consumptie toeslag [Eigen_consumptie_toeslag] — aanvinkvak  (standaard: no)
  - Rozenbeer Cadeau [Rozenbeer_Cadeau] — aanvinkvak  (standaard: no)
  - Zeeprozen Boeket [Zeeprozen_Boeket] — aanvinkvak  (standaard: no)
  - Wellness Care Set [Wellness_Care_Set] — aanvinkvak  (standaard: no)
  - Massagetafel [Massagetafel] — aanvinkvak  (standaard: no)
  - Shisha [Shisha] — keuzelijst: Love66 (+ EUR 30) | Blue Mystic (+ EUR 25) | Mi Amore (+ EUR 25)
  - Extra badlinnen pakket [Extra_badlinnen_pakket] — aanvinkvak  (standaard: no)

Resource 252021 — B&W Angie Wellness Suite Overnachting
  Per nacht, 1 t/m 14 nachten
  - Inchecktijd [Inchecktijd] — keuzelijst: 20:00 - Standaard | 13:00 - Early check-in | 01:00 - Bruidsnacht Arrangement  (standaard: 20:00 - Standaard)
  - Uitchecktijd [Uitchecktijd] — keuzelijst: 11:00 - Standaard uitchecken | 12:00 - Laat uitchecken (+ EUR 50) | 13:00 - Laat uitchecken (+ EUR 100) | 14:00 - Laat uitchecken (+ EUR 150) | 15:00 - Laat uitchecken (+ EUR 200) | 16:00 - Laat uitchecken (+ EUR 250) | 17:00 - Laat uitchecken (+ EUR 300) | 18:00 - Laat uitchecken (+ EUR 350)  (standaard: 11:00 - Standaard uitchecken)
  - Aantal volwassenen [adults] — aantal: 2 | 3  (standaard: 2)
  - Kinderen 2 12 jaar [Kinderen__2_12_jaar] — keuzelijst: 0 | 1 | 2  (standaard: 0)
  - Baby s en peuters 0 1 jaar [Baby_s_en_peuters_0_1_jaar] — keuzelijst: 0 | 1 | 2
  - All inclusive arrangementen [All_inclusive_arrangementen] — aanvinkvak  (standaard: yes)
  - Verjaardag arrangement [Verjaardag_arrangement] — aanvinkvak  (standaard: no)
  - Verjaardag deluxe arrangement [Verjaardag_deluxe_arrangement] — aanvinkvak  (standaard: no)
  - Romantisch arrangement [Romantisch_arrangement] — aanvinkvak  (standaard: no)
  - VIP Arrangement [VIP_Arrangement] — aanvinkvak  (standaard: no)
  - VIP menukeuze [VIP_menukeuze] — keuzelijst: Sushi schaal (voor 2 pers.) | Burgermenu (voor 2 pers.)
  - 365 Valentine Romantisch deluxe [365_Valentine__Romantisch_deluxe] — aanvinkvak  (standaard: no)
  - Honeymoon overnachting [Honeymoon_overnachting] — aanvinkvak  (standaard: no)
  - Ontbijt [Ontbijt] — keuzelijst: 2 personen | 3 personen | 4 personen
  - Luxe champagne ontbijt [Luxe_champagne_ontbijt] — aanvinkvak  (standaard: no)
  - Lunch [Lunch] — keuzelijst: Standaard | Vegetarisch | Halal
  - Lunch aantal personen [Lunch___aantal_personen] — keuzelijst: 2 personen | 3 personen | 4 personen
  - Burgermenu [Burgermenu] — keuzelijst: Black angus beef | Crispy chicken | Vega burger
  - Burgermenu aantal personen [Burgermenu___aantal_personen] — keuzelijst: 1 | 2 | 3 | 4
  - Deluxe menu [Deluxe_menu] — aanvinkvak  (standaard: no)
  - Chicken platter [Chicken_platter] — aanvinkvak  (standaard: no)
  - Warme borrelplank [Warme_borrelplank] — keuzelijst: 0 | 1 | 2 | 3  (standaard: 0)
  - Charcuterie Board warme en koude tapas [Charcuterie_Board___warme_en_koude_tapas_] — keuzelijst: 0 | 1 | 2 | 3  (standaard: 0)
  - Sushi Experience [Sushi_Experience] — aanvinkvak  (standaard: no)
  - High Tea [High_Tea] — aanvinkvak  (standaard: no)
  - Tasting tree experience [Tasting_tree_experience] — aanvinkvak  (standaard: no)
  - Fruitschaal [Fruitschaal] — aanvinkvak  (standaard: no)
  - Mocktail Karaf [Mocktail_Karaf] — keuzelijst: Pina Colada | Mojito | Passionfruit Martini
  - Wijn of prosecco [Wijn_of_prosecco] — keuzelijst: Prosecco | Chardonnay | Zoet witte wijn | Rode wijn
  - Wijn of prosecco aantal flessen [Wijn_of_prosecco___aantal_flessen] — keuzelijst: 1 | 2 | 3 | 4
  - Moet en Chandon Ice Edition [Moet_en_Chandon_Ice_Edition] — aanvinkvak  (standaard: no)
  - Eigen consumptie toeslag [Eigen_consumptie_toeslag] — aanvinkvak  (standaard: no)
  - Rozenbeer Cadeau [Rozenbeer_Cadeau] — aanvinkvak  (standaard: no)
  - Zeeprozen Boeket [Zeeprozen_Boeket] — aanvinkvak  (standaard: no)
  - Wellness Care Set [Wellness_Care_Set] — aanvinkvak  (standaard: no)
  - Massagetafel [Massagetafel] — aanvinkvak  (standaard: no)
  - Shisha [Shisha] — keuzelijst: Love66 (+ EUR 30) | Blue Mystic (+ EUR 25) | Mi Amore (+ EUR 25)
  - Extra badlinnen pakket [Extra_badlinnen_pakket] — aanvinkvak  (standaard: no)
```
