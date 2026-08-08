# Preisvorschlag

Stand: 2026-08-08. Grundlage: `docs/MARGIN_ANALYSIS.md`, echte CJ-Tarife China → Philippinen, Kurs 60,70 PHP/USD.

**Vorschlag, nichts wurde geändert.** In der Datenbank steht unverändert der alte Preis.

---

## Die Rechnung

```
Preis = (Einkauf + Versand) / (1 − Marge − Zahlungsgebühr)
```

Angesetzt: **50 % Marge**, **3 % Zahlungsgebühr** (PayMongo/PayPal), gerundet auf glatte Zehner minus 1, Untergrenze ₱199.

Ergebnis: **77 von 81 Artikeln** müssten teurer werden. Die Gesamtmarge über alle Artikel läge dann bei rund **₱32.600** statt bei einem Verlust.

## Die fünfzehn größten Sprünge

| Kategorie | Artikel | Gew. | alt | Einkauf | Versand | Marge alt | **neu** |
|---|---|---:|---:|---:|---:|---:|---:|
| lights | Candle Tears LED Electronic | 320 g | 80 | 28 | 285 | −232 | **659** |
| bracelets | Metal Cross Bracelet | 269 g | 90 | 31 | 261 | −202 | **619** |
| lights | Creative New Products Western Reli… | 670 g | 410 | 143 | 419 | −153 | **1.199** |
| bracelets | Bronzing Acrylic Cross Bead | 30 g | 50 | 32 | 111 | −93 | **299** |
| crosses | Love 8-character Cross Pendant | 10 g | 10 | 2 | 97 | −89 | **209** |
| rosaries | Luminous Rosary Necklace | 158 g | 210 | 75 | 198 | −63 | **579** |
| rosaries | Wooden Beads Cross Catholic Rosary | 20 g | 70 | 25 | 104 | −59 | **269** |
| bracelets | Pine Wood Beads Cross Beads | 30 g | 90 | 32 | 111 | −53 | **299** |
| rosaries | Children's Angel Pendant Rosary | 28 g | 100 | 36 | 110 | −45 | **309** |
| bracelets | Beads Angel Bracelet Cross Pearl | 9 g | 80 | 28 | 97 | −45 | **269** |
| crosses | Jesus cross pendant | 35 g | 110 | 38 | 115 | −43 | **329** |
| lights | Candle Diy Material Lamp Wick | 61 g | 140 | 49 | 133 | −41 | **389** |
| rosaries | Cross Jesus Rosary Necklace | 40 g | 120 | 41 | 118 | −39 | **339** |
| bracelets | Beaded cross accessory bracelet | 22 g | 100 | 33 | 105 | −39 | **299** |
| bracelets | Crystal Rosary Bracelet Gift | 17 g | 100 | 36 | 102 | −38 | **289** |

Das sind Verdrei- bis Verachtfachungen. Ehrlich gesagt: **so würde ich das nicht machen.**

---

## Der bessere Weg

Der Vorschlag oben rechnet mit **einem Artikel pro Bestellung**. Das ist der teuerste denkbare Fall, weil die Grundgebühr von ₱97 auf ein einziges Stück fällt.

Typisches Armband, 30 g, Einkauf ₱33:

| Artikel im Warenkorb | Versand gesamt | pro Artikel | nötiger Preis |
|---:|---:|---:|---:|
| 1 | ₱111 | ₱111 | **₱309** |
| 2 | ₱132 | ₱66 | **₱209** |
| 3 | ₱153 | ₱51 | **₱179** |
| 4 | ₱173 | ₱43 | **₱159** |
| 5 | ₱193 | ₱39 | **₱149** |

Drei Armbänder statt einem, und der nötige Preis fällt von ₱309 auf ₱179. Der zweite Artikel im Paket kostet im Versand fast nichts.

**Empfehlung: moderat erhöhen und den Warenkorb vergrößern, statt die Preise zu verdreifachen.**

1. **Untergrenze ₱199.** Alles darunter raus oder hoch. Ein Devotionalienshop mit ₱10-Artikeln wirkt nicht günstig, sondern billig — beim Taufgeschenk ist das der falsche Eindruck.
2. **Mindestbestellwert ₱500** oder Gratisversand ab ₱800. Beides schiebt den Warenkorb genau dorthin, wo der Versand sich rechnet.
3. **Sets bündeln.** Drei Armbänder als „Familienset", Rosenkranz plus Kreuz als „Taufset". Bündel lösen das Versandproblem und verkaufen sich bei Geschenkanlässen besser als Einzelstücke.
4. **Schwere Billigartikel auslisten.** Die 320-g-LED-Kerze für ₱80 und das 269-g-Armband für ₱90 werden auch mit Bündeln nicht rentabel.

---

## Was noch fehlt

- **Zahlungsgebühren** sind mit 3 % pauschal angesetzt. Die echten Sätze von PayMongo und PayPal solltest du einsetzen; PayPal international liegt eher bei 4–5 % plus Fixbetrag.
- **Verpackung und Retouren** sind nicht enthalten.
- **Attribut „Ordinary"** liegt allen Tarifen zugrunde. Die LED-Kerzen enthalten vermutlich Batterien und fallen damit in eine teurere Klasse.
- **Nur Philippinen.** Auslandsbestellungen kosten mehr; ins Ausland trägt sich noch weniger.
- Sobald die **`shipping-quote`-Function** live ist, brauchst du diese Schätzung nicht mehr — dann steht der echte Betrag pro Warenkorb im Checkout.

---

Erstellt von Claude für Bodo Kopplin, 08.08.2026.
