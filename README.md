# PROFITHERM CRM

Lokální desktopový CRM pro evidenci objektů, jejich správců, kontaktů, měřidel a komunikace. Aplikace je v češtině a po sestavení funguje offline. Data jsou uložena v lokální databázi SQLite.

## Stažení a instalace na macOS

1. Po sloučení workflow do výchozí větve otevřete v repozitáři **Actions → macOS DMG → Run workflow**. Vyberte `main` a spusťte sestavení. Pro samotné stažení můžete použít i existující úspěšný běh.
2. V detailu úspěšného běhu v části **Artifacts** stáhněte `PROFITHERM-CRM-macOS-universal`. K soukromému repozitáři potřebujete příslušný přístup a přihlášení ke GitHubu. Artefakt je dostupný 30 dní.
3. Rozbalte ZIP, otevřete soubor `.dmg` a přetáhněte **PROFITHERM CRM.app** do složky **Aplikace**. Jeden instalátor obsahuje verzi pro Apple Silicon i Intel. Databáze vznikne lokálně při prvním spuštění.

Sestavení používá ad hoc podpis a nemá podpis Apple Developer ID ani notarizaci. Gatekeeper proto může první spuštění zablokovat. Pokud jste DMG stáhli z důvěryhodného běhu tohoto repozitáře, zkuste aplikaci otevřít, potom přejděte do **Nastavení systému → Soukromí a zabezpečení** a u blokované aplikace zvolte **Přesto otevřít**. Spravovaný Mac může tuto výjimku zakázat. Pro běžnou distribuci bez tohoto kroku je potřeba podpis Developer ID a notarizace. [Pokyny Apple ke Gatekeeperu](https://support.apple.com/cs-cz/102445)

## Požadavky

- Node.js 22.22.2+ v řadě 22, 24.15+ v řadě 24 nebo novější stabilní verze a npm. Verze balíčků jsou uzamčené v `package-lock.json`.
- Stabilní Rust 1.94 nebo novější přes [rustup](https://rustup.rs/), Cargo a nástroje platformy pro [Tauri 2](https://v2.tauri.app/start/prerequisites/).
- Debian 13 / Ubuntu 24.04: nainstalujte vývojové knihovny GTK a WebKitGTK 4.1.

  ```sh
  sudo apt-get update
  sudo apt-get install build-essential pkg-config libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```

- Windows: Visual Studio Build Tools s komponentou **Desktop development with C++**, Windows SDK, MSVC Rust toolchain a Microsoft Edge WebView2.
- macOS: nainstalujte Xcode Command Line Tools přes `xcode-select --install`. K distribuci podepsaného balíčku je potřeba samostatná konfigurace certifikátů.

## Spuštění a sestavení

Příkazy spouštějte v kořenu klonu:

```sh
npm ci
npm run tauri -- dev
```

Samotné `npm run dev` spouští Vite pro vývoj rozhraní. Pro načtení dat a nativní dialogy aplikaci spusťte příkazem Tauri výše.

```sh
npm run build
npm run tauri -- build
```

Tauri vytvoří binární soubor a balíčky pro aktuální systém v `src-tauri/target/release/`. Na Debianu lze zvolit jen balíček DEB příkazem `npm run tauri -- build --bundles deb`.

## Testy

```sh
npm test
cargo test --locked --manifest-path src-tauri/Cargo.toml --no-default-features
cargo fmt --manifest-path src-tauri/Cargo.toml --check
```

První sada ověřuje české rozhraní, vyhledávání, validaci a okamžik otevření editoru. Druhá sada spouští skutečné migrace a operace nad dočasnými soubory SQLite. Volba `--no-default-features` umožňuje tyto databázové testy spustit i bez nativních knihoven Tauri. [Postup kontroly v desktopové aplikaci](docs/acceptance.md).

## Evidence

- **Objekty** lze vytvořit se správcem i samostatně. Dvě vyhledávací pole a filtr správce lze použít současně. Přehled má 25 objektů na stránku a řadí podle zahájení posledního uloženého záznamu.
- **Správcovské firmy** mají vlastní přehled objektů i kontaktů. Existující objekt lze přiřadit, převést k jinému správci nebo ponechat bez správce.
- **Kontakty** lze opakovaně přiřazovat ke správci i k objektu. Detail kontaktu ukazuje jeho přiřazení.
- **Komunikace** eviduje typ, text a volitelný kontakt. Čas v přehledu odpovídá otevření editoru. Uložené záznamy zatím nelze měnit ani mazat.
- **Nastavení** nabízí zálohu a archiv. Záznam obnovíte v **Nastavení → Archiv → detail záznamu → Obnovit**.

## Databáze a obnova ze zálohy

Aplikace soubor `profitherm.db` vytvoří při prvním spuštění v adresáři dat aplikace:

| Systém | Typické umístění |
| --- | --- |
| Linux | `~/.local/share/cz.profitherm.crm/profitherm.db` (nebo pod `$XDG_DATA_HOME`) |
| Windows | `%LOCALAPPDATA%\cz.profitherm.crm\profitherm.db` |
| macOS | `~/Library/Application Support/cz.profitherm.crm/profitherm.db` |

1. V aplikaci zvolte **Nastavení → Vytvořit zálohu**, vyberte složku a nový název souboru. Aplikace vybraný existující soubor nepřepíše.
2. Před obnovou úplně ukončete PROFITHERM CRM. Pokud máte příkaz `sqlite3`, ověřte zálohu příkazem `sqlite3 cesta-k-zaloze.db "PRAGMA integrity_check;"`. Výsledek má být `ok`.
3. Přesuňte dosavadní soubor `profitherm.db` i případné soubory `profitherm.db-wal` a `profitherm.db-shm` společně do bezpečné složky mimo datový adresář. Zálohu zkopírujte na původní místo pod názvem `profitherm.db`.
4. Spusťte CRM a ověřte očekávané záznamy. Původní soubory ponechte, dokud nepotvrdíte úspěšnou obnovu.

Aplikace a zálohy jsou určeny pro jednoho uživatele. Databáze i zálohy jsou běžné soubory SQLite a mohou obsahovat osobní údaje. Přenos mezi počítači probíhá ruční zálohou a obnovou.

[Architektura](docs/architecture.md) · [Databáze](docs/database.md) · [Plán dalších fází](docs/roadmap.md)
