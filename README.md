# RelayReport

Prepara il report mensile per un cliente. Inserisci i numeri, premi "Prepara il report", rileggi il testo, firma e poi invia.

**Strumento:** https://riccardobozzato94.github.io/relay-report/

## Il sistema dietro la pagina

La pagina è semplice di proposito. Sotto c'è un'API su Cloudflare Worker (`worker/index.js`) che fa il lavoro vero:

- **10 casi di test** (`worker/eval-cases.json`) con output atteso
- **validazione**: controlla che numeri e CPA siano presenti nel testo generato
- **retry**: se il modello sbaglia, riprova
- **fallback**: se due modelli Workers AI falliscono, usa un template locale con i numeri corretti
- **human gate**: lo stato resta `draft` finché una persona non firma; nessun invio automatico

### Endpoints
- `GET /api/health` — stato del servizio
- `GET /api/eval` — esegue i 10 test e restituisce accuratezza, casi perfetti, fallback, latenza
- `POST /api/report` — genera un report con validazione e fallback

### Test locale (senza Cloudflare)
```
node test-worker.mjs
```
Con AI valida: 10/10 casi, 0 fallback. Con AI che sbaglia: 10/10 fallback, numeri corretti.

### Deploy
```
wrangler deploy --config wrangler.toml
```
Richiede un Cloudflare API token con permesso *Workers Scripts: Edit*. Uno OAuth con solo `user:read` non basta.

Nessun dato reale. Nessun invio automatico. Costs: free tier Workers AI (10.000 neurons/giorno).
