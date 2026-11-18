pub mod database;
pub mod models;

#[cfg(feature = "desktop")]
mod commands;

#[cfg(feature = "desktop")]
pub fn run() {
    use tauri::Manager;

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data = app.path().app_local_data_dir()?;
            let database = tauri::async_runtime::block_on(async {
                tokio::fs::create_dir_all(&data).await?;
                Ok::<_, Box<dyn std::error::Error>>(
                    database::Database::open(&data.join("profitherm.db")).await?,
                )
            });
            app.manage(commands::Startup(database.map_err(|err| {
                eprintln!("Database initialization: {err:?}");
                "Databázi se nepodařilo otevřít nebo bezpečně aktualizovat.".to_owned()
            })));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_company,
            commands::update_company,
            commands::get_company,
            commands::list_companies,
            commands::archive_company,
            commands::create_object,
            commands::update_object,
            commands::get_object,
            commands::search_objects,
            commands::archive_object,
            commands::set_object_company,
            commands::create_contact,
            commands::update_contact,
            commands::get_contact,
            commands::list_contacts,
            commands::archive_contact,
            commands::assign_contact_to_object,
            commands::remove_contact_from_object,
            commands::assign_contact_to_company,
            commands::remove_contact_from_company,
            commands::create_activity,
            commands::list_object_activities,
            commands::create_database_backup,
            commands::restore_entity,
            commands::create_linked_contact,
        ])
        .run(tauri::generate_context!());
    if let Err(error) = result {
        eprintln!("Aplikaci se nepodařilo spustit: {error}");
        std::process::exit(1);
    }
}
