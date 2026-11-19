# Apollo Werkbank

Eine kleine Gestaltungs-Werkbank für den Browser. Fünf Farben wandern durch alle Werkzeuge:

- **Farben** – Paletten nach Harmonie mischen, Farben sperren, Kontraste nach WCAG prüfen, als CSS, Tailwind oder JSON exportieren
- **Verlauf** – Mesh-, lineare und konische Verläufe mit ziehbaren Punkten, CSS zum Kopieren
- **Schrift** – Schriftpaare und Größenskala nach musikalischen Intervallen
- **Generator** – Grafiken aus der Palette (Strömung, Umlaufbahn, Kacheln), reproduzierbar über einen Startwert, Export als SVG
- **Prompt** – Bildprompts aus Motiv, Stil, Licht, Kamera und Palette
- **Sammlung** – alles Gespeicherte, liegt im `localStorage` des Browsers

## Starten

Kein Build, keine Abhängigkeiten. `index.html` im Browser öffnen oder einen beliebigen statischen Server starten:

```
python3 -m http.server 8000
```

`node tools/build-artifact.mjs <Zieldatei>` fasst alles zu einer einzelnen HTML-Datei zusammen.

# Mein Takt

`takt/mein-takt.html` ist eine Handy-App für Gesundheit und Gewohnheiten: Wasser, Bewegung, Schlaf und Stimmung abhaken, dazu fünf Kurz-Workouts von 4 bis 12 Minuten mit Timer, Tönen und Wochenübersicht. Die Datei ist für die Veröffentlichung als Claude-Artifact geschrieben; dort werden die Einträge im Claude-Konto gespeichert, sonst im Browser.
