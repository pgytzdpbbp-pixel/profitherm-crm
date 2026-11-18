use sqlx::{Sqlite, Transaction};
use uuid::Uuid;

use super::records::{ensure_active, target_tables};
use super::{Database, Error, Result, optional};
use crate::models::{Entity, LinkedContact};

impl Database {
    pub(super) async fn linked_contacts(
        &self,
        entity: Entity,
        id: &str,
    ) -> Result<Vec<LinkedContact>> {
        let (_, link, column) = target_tables(entity)?;
        let query = format!("SELECT c.id, c.first_name, c.last_name, c.phone, c.email, l.role_label, c.archived_at
            FROM {link} l JOIN contacts c ON c.id = l.contact_id WHERE l.{column} = ?
            ORDER BY c.archived_at IS NOT NULL, c.last_name COLLATE NOCASE, c.first_name COLLATE NOCASE, c.id");
        let contacts = sqlx::query_as(sqlx::AssertSqlSafe(query))
            .bind(id)
            .fetch_all(&self.pool)
            .await?;
        Ok(contacts)
    }

    pub async fn assign_contact(
        &self,
        entity: Entity,
        id: Uuid,
        contact_id: Uuid,
        role: Option<String>,
    ) -> Result<()> {
        let mut tx = self.pool.begin_with("BEGIN IMMEDIATE").await?;
        assign_contact_in(&mut tx, entity, id, contact_id, role).await?;
        tx.commit().await?;
        Ok(())
    }

    pub async fn remove_contact(&self, entity: Entity, id: Uuid, contact_id: Uuid) -> Result<()> {
        let (table, link, column) = target_tables(entity)?;
        let id = id.to_string();
        let mut tx = self.pool.begin_with("BEGIN IMMEDIATE").await?;
        ensure_active(&mut tx, table, &id).await?;
        let query = format!("DELETE FROM {link} WHERE {column} = ? AND contact_id = ?");
        sqlx::query(sqlx::AssertSqlSafe(query))
            .bind(id)
            .bind(contact_id.to_string())
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(())
    }
}

pub(super) async fn assign_contact_in(
    tx: &mut Transaction<'_, Sqlite>,
    entity: Entity,
    id: Uuid,
    contact_id: Uuid,
    role: Option<String>,
) -> Result<()> {
    let (table, link, column) = target_tables(entity)?;
    let id = id.to_string();
    let contact = contact_id.to_string();
    ensure_active(tx, table, &id).await?;
    ensure_active(tx, "contacts", &contact).await?;
    let query = format!(
        "INSERT INTO {link} ({column}, contact_id, role_label) VALUES (?, ?, ?)
            ON CONFLICT({column}, contact_id) DO NOTHING"
    );
    let result = sqlx::query(sqlx::AssertSqlSafe(query))
        .bind(id)
        .bind(contact)
        .bind(optional(role.as_deref()))
        .execute(&mut **tx)
        .await?;
    if result.rows_affected() == 0 {
        return Err(Error::Duplicate);
    }
    Ok(())
}
