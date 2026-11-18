# Architektura

React vykresluje české rozhraní z místních souborů. Tailwind a sdílené komponenty zajišťují společné styly. Obrazovky v `src/features` spravují formuláře a zobrazení dat. Formuláře před odesláním kontroluje Zod. `src/services/api.ts` je jediné místo, kde frontend volá typované příkazy Tauri.

Tauri 2 spouští jedinou instanci aplikace a při startu vyhledá adresář lokálních dat. `src-tauri/src/commands.rs` překládá typované požadavky na operace datové vrstvy a vrací české popisy očekávaných chyb. Datová vrstva v `src-tauri/src/database` validuje hodnoty, provádí parametrizované dotazy SQLx a spravuje transakce. Frontend nedostává rozhraní pro vykonávání SQL ani přímý přístup k databázovému souboru.

Editor předává okamžik svého otevření v UTC jako součást požadavku. Databázová operace přidává zvlášť čas uložení. Opuštění editoru zahodí jeho stav. Po uložení se časová osa načte ze SQLite a při návratu na přehled se načte aktuální pořadí objektů. Formátování data v rozhraní používá češtinu a časové pásmo Europe/Prague včetně změn letního času.

Nastavení zálohy používá nativní dialog pro volbu cíle. SQLite vytvoří konzistentní snímek přes `VACUUM INTO` do dočasného souboru ve zvoleném adresáři, aplikace jej synchronizuje a zveřejní pod cílovým názvem až po úspěchu. Existující soubory se nepřepisují. Aplikace nepotřebuje síťový server ani externí služby.
