use std::path::PathBuf;

use tauri::State;
use uuid::Uuid;

use crate::database::{Database, Error, Result};
use crate::models::*;

pub struct Startup(pub std::result::Result<Database, String>);
#[derive(serde::Serialize)]
pub struct CommandError {
    message: String,
}

type Reply<T> = std::result::Result<T, CommandError>;

impl Startup {
    fn database(&self) -> Reply<&Database> {
        self.0.as_ref().map_err(|message| CommandError {
            message: message.clone(),
        })
    }
}

fn reply<T>(result: Result<T>) -> Reply<T> {
    result.map_err(|error| {
        if matches!(error, Error::Sql(_) | Error::BackupIo(_)) {
            eprintln!("Database command: {error:?}");
        }
        CommandError {
            message: error.to_string(),
        }
    })
}

macro_rules! record_commands {
    ($create:ident, $update:ident, $get:ident, $archive:ident, $write:ident, $load:ident, $input:ty, $detail:ty, $entity:expr) => {
        #[tauri::command]
        pub async fn $create(state: State<'_, Startup>, input: $input) -> Reply<Uuid> {
            reply(state.database()?.$write(None, input).await)
        }

        #[tauri::command]
        pub async fn $update(state: State<'_, Startup>, id: Uuid, input: $input) -> Reply<Uuid> {
            reply(state.database()?.$write(Some(id), input).await)
        }

        #[tauri::command]
        pub async fn $get(state: State<'_, Startup>, id: Uuid) -> Reply<$detail> {
            reply(state.database()?.$load(id).await)
        }

        #[tauri::command]
        pub async fn $archive(state: State<'_, Startup>, id: Uuid) -> Reply<()> {
            reply(state.database()?.set_archive($entity, id, true).await)
        }
    };
}

record_commands!(
    create_company,
    update_company,
    get_company,
    archive_company,
    write_company,
    get_company,
    CompanyInput,
    CompanyDetail,
    Entity::Company
);
record_commands!(
    create_object,
    update_object,
    get_object,
    archive_object,
    write_object,
    get_object,
    ObjectInput,
    ObjectDetail,
    Entity::Object
);
record_commands!(
    create_contact,
    update_contact,
    get_contact,
    archive_contact,
    write_contact,
    get_contact,
    ContactInput,
    ContactDetail,
    Entity::Contact
);

#[tauri::command]
pub async fn list_companies(state: State<'_, Startup>, archived: bool) -> Reply<Vec<Company>> {
    reply(state.database()?.list_companies(archived).await)
}

#[tauri::command]
pub async fn list_contacts(state: State<'_, Startup>, archived: bool) -> Reply<Vec<Contact>> {
    reply(state.database()?.list_contacts(archived).await)
}

#[tauri::command]
pub async fn search_objects(state: State<'_, Startup>, input: ObjectSearch) -> Reply<ObjectPage> {
    reply(state.database()?.search_objects(input).await)
}

#[tauri::command]
pub async fn set_object_company(
    state: State<'_, Startup>,
    id: Uuid,
    company_id: Option<Uuid>,
    current_company_id: Option<Uuid>,
) -> Reply<()> {
    reply(
        state
            .database()?
            .set_object_company(id, company_id, current_company_id)
            .await,
    )
}

macro_rules! relationship_commands {
    ($assign:ident, $remove:ident, $entity:expr) => {
        #[tauri::command]
        pub async fn $assign(
            state: State<'_, Startup>,
            id: Uuid,
            contact_id: Uuid,
            role: Option<String>,
        ) -> Reply<()> {
            reply(
                state
                    .database()?
                    .assign_contact($entity, id, contact_id, role)
                    .await,
            )
        }

        #[tauri::command]
        pub async fn $remove(state: State<'_, Startup>, id: Uuid, contact_id: Uuid) -> Reply<()> {
            reply(
                state
                    .database()?
                    .remove_contact($entity, id, contact_id)
                    .await,
            )
        }
    };
}

relationship_commands!(
    assign_contact_to_object,
    remove_contact_from_object,
    Entity::Object
);
relationship_commands!(
    assign_contact_to_company,
    remove_contact_from_company,
    Entity::Company
);

#[tauri::command]
pub async fn create_activity(state: State<'_, Startup>, input: ActivityInput) -> Reply<Uuid> {
    reply(state.database()?.create_activity(input).await)
}

#[tauri::command]
pub async fn list_object_activities(state: State<'_, Startup>, id: Uuid) -> Reply<Vec<Activity>> {
    reply(state.database()?.list_object_activities(id).await)
}

#[tauri::command]
pub async fn create_database_backup(state: State<'_, Startup>, path: PathBuf) -> Reply<()> {
    reply(state.database()?.create_database_backup(&path).await)
}

#[tauri::command]
pub async fn restore_entity(state: State<'_, Startup>, entity: Entity, id: Uuid) -> Reply<()> {
    reply(state.database()?.set_archive(entity, id, false).await)
}

#[tauri::command]
pub async fn create_linked_contact(
    state: State<'_, Startup>,
    entity: Entity,
    id: Uuid,
    input: ContactInput,
    role: Option<String>,
) -> Reply<Uuid> {
    reply(
        state
            .database()?
            .create_linked_contact(entity, id, input, role)
            .await,
    )
}
