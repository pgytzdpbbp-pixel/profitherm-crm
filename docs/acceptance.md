# Kontrola desktopové aplikace

Spusťte `npm run tauri -- dev` nebo nainstalujte sestavený balíček. Pro zkoušky použijte novou databázi a fiktivní údaje.

| Test | Postup a očekávaný výsledek |
| --- | --- |
| 01 | Uložte objekt s měřidly a poznámkou. Ukončete CRM a znovu jej otevřete. V detailu zůstaly všechny údaje. |
| 02 | Vytvořte firmu a tři objekty. V detailu firmy je postupně přiřaďte. Firma zobrazí všechny tři. |
| 03 | Uložte další objekt se správcem **Bez správce**. Objeví se v hlavním přehledu. |
| 04 | Vytvořte kontakt a přiřaďte jej ke dvěma objektům. Vyhledejte kontakt podle jména nebo telefonu a zkontrolujte, že seznam obsahuje oba objekty. |
| 05 | Přiřaďte jiný kontakt na detailu firmy. Hledání podle jeho e-mailu najde všechny objekty ve správě firmy. |
| 06 | Otevřete **Nový záznam**, vyčkejte na další minutu a uložte text. Časová osa ukáže minutu otevření editoru. Při zrušení a novém otevření se použije nový čas. |
| 07 | Zapište komunikaci ke dvěma objektům v různých časech. Po návratu do přehledu je novější aktivita první. Změna názvu toto pořadí neposune. |
| 08 | Vyhledejte společný kontakt a zvolte filtr jedné firmy. Výsledek obsahuje jen odpovídající objekty této firmy. |
| 09 | Zadejte záporný počet měřidel a zkuste uložit. Formulář ukáže českou chybu a hodnotu neuloží. |
| 10 | Zvolte **Nastavení → Vytvořit zálohu**, vyberte nový soubor a spusťte nad ním `PRAGMA integrity_check`. Výsledek je `ok` a záloha obsahuje očekávané objekty a komunikaci. |
| 11 | Archivujte objekt s komunikací. V aktivním přehledu zmizí. Otevřete jej v archivu a obnovte. Komunikace se zachová. |
| 12 | Spusťte CRM s novým adresářem dat. Ověřte, že se vytvořil `profitherm.db` a přehled ukazuje **Zatím tu nejsou žádné objekty**. |
