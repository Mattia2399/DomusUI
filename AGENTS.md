# Istruzioni per gli agenti

Prima di creare o modificare pagine, card, pannelli o componenti dell’interfaccia, leggi e segui **[DESIGN.md](DESIGN.md)**. È obbligatorio.

In breve:

- **Non inventare il design.** Riproduci il riferimento approvato indicato in DESIGN.md §1. Se il riferimento non c’è, fermati e chiedilo.
- **Usa quello che c’è già:** componenti `Glass*` di `src/components/ui/`, token `--ui-*` e `src/theme/glassTokens.css`. Niente colori, font o misure scritti a mano.
- **Non usare come modello** le pagine vecchie elencate in DESIGN.md §3.
- **Confronta con il riferimento.** Fai screenshot a 390 e 1280 px, in chiaro e in scuro, e chiudi con la tabella delle differenze (DESIGN.md §2).
- **I file del Grid Engine e la Home attuale non si toccano** senza mostrare prima il diff e avere l’ok (DESIGN.md §7).
