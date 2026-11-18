# RelayReport

Demo interattiva di **reporting client per agenzie con approvazione umana**. L'AI prepara la bozza dai KPI, l'umano firma, il cliente riceve solo dopo l'approvazione. Ogni azione finisce in un audit log.

**Live demo:** https://riccardobozzato94.github.io/relay-report/

## Cosa dimostra
- Flusso `draft → approved → sent`: lo stato `sent` è raggiungibile solo dopo la firma umana.
- **Output AI reale** catturato il 18/11/2026 dal router locale FreeLLMAPI (`dots-studio/dots-3-note-preview:free`): l'AI ha emesso lo schema di esempio invece del report → **scartato dalla validazione umana**.
- **Confronto dopo correzione**: stesso dato, prompt riscritto con vincoli di formato (`Qwen3.6-27B`) → narrativa corretta di 3 frasi → firmata dall'umano. Dimostra che il miglioramento nasce da **criteri di accettazione e validazione**, non dal cambio di modello.
- Nessun numero inventato, nessun cliente reale, nessuna percentuale garantita.

## Stack
HTML/CSS/JS statico, GitHub Pages. In produzione: Cloudflare Workers + D1, Gemini free tier, Make free.

Parte del portfolio AI Operations di Riccardo Bozzato, PMP®.
