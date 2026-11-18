use std::path::Path;

use chrono::Utc;
use uuid::Uuid;

use super::records::ensure_active;
use super::{Database, Error, Result, required, utc};
use crate::models::{Activity, ActivityInput};

impl Database {
    pub async fn create_activity(&self, input: ActivityInput) -> Result<Uuid> {
        let content = required(&input.content, "Vyplňte text záznamu.")?;
        let saved = Utc::now();
        if input.started_at > saved {
            return Err(Error::Validation(
                "Čas zahájení je v budoucnosti. Otevřete editor znovu.",
            ));
        }
        let id = Uuid::new_v4();
        let object = input.object_id.to_string();
        let contact = input.contact_id.map(|id| id.to_string());
        let mut tx = self.pool.begin_with("BEGIN IMMEDIATE").await?;
        ensure_active(&mut tx, "objects", &object).await?;
        if let Some(contact) = &contact {
            ensure_active(&mut tx, "contacts", contact).await?;
            let linked: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM object_contacts WHERE object_id = ? AND contact_id = ?)
                 OR EXISTS(SELECT 1 FROM objects o
                    JOIN management_company_contacts c ON c.management_company_id = o.management_company_id
                    WHERE o.id = ? AND c.contact_id = ?)"
            ).bind(&object).bind(contact).bind(&object).bind(contact).fetch_one(&mut *tx).await?;
            if !linked {
                return Err(Error::Validation(
                    "Kontakt musí být přiřazen k objektu nebo jeho správci.",
                ));
            }
        }
        let saved = utc(saved);
        sqlx::query("INSERT INTO activities (id, object_id, contact_id, activity_type, content, started_at, saved_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(id.to_string()).bind(object).bind(contact).bind(input.activity_type).bind(content)
            .bind(utc(input.started_at)).bind(&saved).bind(&saved).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(id)
    }

    pub async fn list_object_activities(&self, id: Uuid) -> Result<Vec<Activity>> {
        let items = sqlx::query_as(
            "SELECT a.*, c.first_name || ' ' || c.last_name AS contact_name
            FROM activities a LEFT JOIN contacts c ON c.id = a.contact_id WHERE a.object_id = ?
            ORDER BY a.started_at DESC, a.saved_at DESC, a.id DESC",
        )
        .bind(id.to_string())
        .fetch_all(&self.pool)
        .await?;
        Ok(items)
    }

    pub async fn create_database_backup(&self, destination: &Path) -> Result<()> {
        let parent = destination
            .parent()
            .filter(|_| destination.is_absolute() && destination.file_name().is_some())
            .ok_or(Error::Validation("Vyberte umístění zálohy."))?;
        if destination.try_exists().map_err(Error::BackupIo)? {
            return Err(Error::BackupExists);
        }
        // SQLite fills an empty file; publish it in the same directory only after it is complete.
        let temporary = tempfile::Builder::new()
            .prefix(".profitherm-")
            .tempfile_in(parent)
            .map_err(Error::BackupIo)?;
        let path = temporary
            .path()
            .to_str()
            .ok_or(Error::Validation("Název záložního souboru není platný."))?;
        sqlx::query("VACUUM INTO ?")
            .bind(path)
            .execute(&self.pool)
            .await?;
        temporary.as_file().sync_all().map_err(Error::BackupIo)?;
        temporary.persist_noclobber(destination).map_err(|error| {
            if error.error.kind() == std::io::ErrorKind::AlreadyExists {
                Error::BackupExists
            } else {
                Error::BackupIo(error.error)
            }
        })?;
        Ok(())
    }
}
