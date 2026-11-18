# Databáze

Migrace v `src-tauri/migrations` se použijí při otevření databáze. SQLx eviduje použité migrace a jejich kontrolní součty. Pro další změny přidávejte novou migraci. Při neúspěchu aplikace zobrazí chybu a počká na vyřešení problému s databází. Připojení zapínají kontrolu cizích klíčů a používají WAL.

| Tabulka | Význam |
| --- | --- |
| `management_companies` | Správci včetně adresy a kontaktních údajů. |
| `objects` | Budovy, adresa, počty měřidel, technické poznámky a jeden volitelný správce. |
| `contacts` | Osoby a jejich údaje včetně normalizovaného telefonu. |
| `object_contacts` | Vazby mezi více objekty a více kontakty s volitelnou rolí. |
| `management_company_contacts` | Vazby mezi více správci a více kontakty s volitelnou rolí. |
| `activities` | Komunikace objektu s volitelným odkazem na kontakt. Typy `phone`, `email`, `meeting` a `note`. |

Hlavní záznamy mají UUID jako primární klíč. Cizí klíče chrání vazby a složené primární klíče zabraňují duplicitnímu přiřazení. Archivace nastaví `archived_at` a zachová vazby i historii. Při vyhledávání aktivních objektů se nezapočítávají archivované kontakty. Archivovaný správce zůstane v detailech dříve přiřazených objektů, které zůstávají aktivní.

Časy jsou řetězce RFC 3339 s milisekundami a příponou `Z`. Index nad `activities(object_id, started_at, saved_at, id)` umožňuje načítat časovou osu a dohledat nejnovější záznam pro každý objekt. Pořadí objektů s komunikací určuje `started_at`. Ostatní objekty se řadí podle vytvoření. Odvozené časy se neukládají do tabulky objektů.

Vyhledávací projekce používá normalizovaný text bez diakritiky. Trigramové indexy SQLite FTS5 obsluhují podřetězce o nejméně třech znacích. Kratší dotazy používají porovnání podřetězce nad normalizovaným textem. Triggery aktualizují projekce ve stejné transakci jako zdrojový záznam. Přímé a zděděné vazby kontaktu se hledají podle indexů vazebních tabulek. Telefon lze vyhledat jako místní české číslo, s předvolbou `+420` nebo `00420` a s běžnými oddělovači.

## Budoucí vazby

`jobs.object_id` může odkazovat na existující objekt a umožnit více nezávislých zakázek na jednom objektu. Nabídka a fakturace mohou mít vlastní stavové tabulky s odkazem na `jobs.id` a samostatnou historii změn. `installation_visits` může mít `job_id` a pořadí návštěvy od 1 do 3, chráněné kontrolou rozsahu a unikátní dvojicí. Historii zakázky lze ukládat jako samostatné události s časy v UTC. Komunikace z fáze 1 může nadále náležet přímo objektu i po zavedení zakázek.
