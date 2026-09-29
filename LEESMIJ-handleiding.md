# Locatiemanager handleiding — installatie

## Wat er verandert
Nieuw (3 bestanden, in de hoofdmap naast dashboard.html):
- handleiding.html — de pagina
- handleiding.css  — opmaak (kleuren bovenaan aan te passen)
- handleiding.js   — inhoud + logica (loadHandleidingData / saveHandleidingData)

Aangepast (1 bestand):
- bwf-menu.js — alleen de knop "📖 Handleiding" erbij + rollen die hem zien
  (eigenaar, vr, locatiemanager). Origineel staat in backup/.

Niet aangeraakt: alle andere pagina's, Supabase-tabellen, reserveringen, Make, Planyo.

## Installeren (Terminal, in ~/bwf-incheck)
    cd ~/bwf-incheck
    git pull
    git tag backup-voor-handleiding          # backup van de huidige versie
    git push origin backup-voor-handleiding
    # kopieer handleiding.html, handleiding.css, handleiding.js en bwf-menu.js hierheen
    git add handleiding.html handleiding.css handleiding.js bwf-menu.js
    git commit -m "BWF Dashboard – met Locatiemanager Handleiding"
    git push

Terugdraaien kan altijd:  git checkout backup-voor-handleiding -- bwf-menu.js

## Teksten aanpassen
Handleiding → ⚙️ Handleiding aanpassen (alleen zichtbaar als eigenaar ingelogd).
Opslaan = alleen op jouw apparaat. Voor het team: "Download handleiding-data.json"
en zet dat bestand in de repo naast handleiding.html (git add + commit + push).
