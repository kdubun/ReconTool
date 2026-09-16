# ReconTool

ReconTool est une application desktop OSINT **offline-first** construite avec Electron, React et TypeScript.
Elle permet de scanner des cibles techniques, de consolider les résultats localement dans SQLite, puis de les
explorer dans un graphe relationnel interactif orienté investigation.

## Fonctionnalites principales

- Scan multi-cibles: `domain`, `ip`, `email`, `url`, `cidr`, `asn`, `nameserver`, `mx`
- Enrichissement passif discret:
  - DNS (`A/AAAA/MX/NS/TXT/CNAME/PTR`)
  - DNS security/mail posture (`SOA`, `CAA`, `DNSSEC`, `SPF`, `DKIM`, `DMARC`)
  - WHOIS local + corrélations reverse WHOIS locales
  - Certificat TLS (`CN`, `SAN`, `issuer`, dates)
- Enrichissement live optionnel (toggle + clés API utilisateur):
  - Shodan, Censys, VirusTotal, AbuseIPDB, GeoIP avancé, détails registre ASN
  - Nmap local (top ports + détection service légère, aussi sur IPs résolues d'un domaine)
- Graphe d'intelligence:
  - Nœuds enrichis (`port`, `service`, `certificate`, `tls_issuer`, `spf`, `dmarc`, `dkim`, `os`, etc.)
  - Filtres, focus, recherche, panneau de détail nœud, métriques de confiance/poids
- Historique de scans + Dashboard + page Graph Intel
- Assistant IA optionnel (analyse automatique des nouveaux scans)
- Workspace volatile en mémoire + Import/Export manuel de snapshot

## Stack technique

- Electron Forge + Vite
- React + TypeScript
- SQLite `better-sqlite3`
- TailwindCSS
- IPC typé avec hardening renderer:
  - `contextIsolation: true`
  - `nodeIntegration: false`

## Installation et demarrage

```bash
npm install
npm start
```

## Commandes utiles

```bash
npm run typecheck
npm run lint
npm run package
```

## Utilisation rapide

1. Ouvre l'onglet **Recon** et entre une cible (le type est détecté automatiquement).
2. Lance le scan pour enregistrer les artefacts dans l'historique local.
3. Va dans **Network** pour explorer les relations.
4. Va dans **Graph Intel** pour analyser les métriques (confidence/weight, top relations).
5. Configure les enrichissements live/API dans **Parametre** si nécessaire.

## Confidentialite et stockage

- Les données de scan sont stockées localement (SQLite).
- Les clés API restent locales à la machine.
- Le mode workspace volatile permet de tout conserver en RAM et d'effacer à la fermeture.

## Cadre legal

Utiliser ReconTool uniquement sur des cibles que tu possèdes ou pour lesquelles tu as une autorisation explicite.
Le scan non autorisé peut être illégal selon la juridiction.
