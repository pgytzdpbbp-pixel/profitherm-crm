use chrono::Utc;
use sqlx::{Sqlite, Transaction};
use uuid::Uuid;

use super::{Database, Error, Result, email, fold, normalize_phone, optional, required, utc};
use crate::models::*;

pub(super) const OBJECT_COLUMNS: &str = "o.*, c.name AS management_company_name,
    c.archived_at AS management_company_archived_at,
    (SELECT a.started_at FROM activities a WHERE a.object_id = o.id
     ORDER BY a.started_at DESC, a.saved_at DESC, a.id DESC LIMIT 1) AS last_activity_at";

pub(super) async fn ensure_active(
    tx: &mut Transaction<'_, Sqlite>,
    table: &'static str,
    id: &str,
) -> Result<()> {
    let query = format!("SELECT archived_at FROM {table} WHERE id = ?");
    let archived = sqlx::query_scalar::<_, Option<String>>(sqlx::AssertSqlSafe(query))
        .bind(id)
        .fetch_one(&mut **tx)
        .await?;
    if archived.is_some() {
        return Err(Error::Archived);
    }
    Ok(())
}

impl Database {
    pub async fn write_company(&self, id: Option<Uuid>, input: CompanyInput) -> Result<Uuid> {
        let name = required(&input.name, "Vyplňte název firmy.")?;
        let email = email(input.email.as_deref())?;
        let key = id.unwrap_or_else(Uuid::new_v4);
        let now = utc(Utc::now());
        let mut tx = self.pool.begin_with("BEGIN IMMEDIATE").await?;
        if id.is_some() {
            ensure_active(&mut tx, "management_companies", &key.to_string()).await?;
        }
        sqlx::query("INSERT INTO management_companies
            (id, name, ico, street, city, postal_code, email, phone, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name, ico=excluded.ico, street=excluded.street,
              city=excluded.city, postal_code=excluded.postal_code, email=excluded.email,
              phone=excluded.phone, notes=excluded.notes, updated_at=excluded.updated_at")
            .bind(key.to_string()).bind(name).bind(optional(input.ico.as_deref()))
            .bind(optional(input.street.as_deref())).bind(optional(input.city.as_deref()))
            .bind(optional(input.postal_code.as_deref())).bind(email)
            .bind(optional(input.phone.as_deref())).bind(optional(input.notes.as_deref()))
            .bind(&now).bind(&now).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(key)
    }

    pub async fn list_companies(&self, archived: bool) -> Result<Vec<Company>> {
        let items = sqlx::query_as(
            "SELECT * FROM management_companies
            WHERE (archived_at IS NOT NULL) = ? ORDER BY name COLLATE NOCASE, id",
        )
        .bind(archived)
        .fetch_all(&self.pool)
        .await?;
        Ok(items)
    }

    pub async fn get_company(&self, id: Uuid) -> Result<CompanyDetail> {
        let key = id.to_string();
        let company = sqlx::query_as("SELECT * FROM management_companies WHERE id = ?")
            .bind(&key)
            .fetch_one(&self.pool)
            .await?;
        let query = format!("SELECT {OBJECT_COLUMNS} FROM objects o
            JOIN management_companies c ON c.id = o.management_company_id
            WHERE o.management_company_id = ? ORDER BY o.archived_at IS NOT NULL, o.name COLLATE NOCASE, o.id");
        let objects = sqlx::query_as(sqlx::AssertSqlSafe(query))
            .bind(&key)
            .fetch_all(&self.pool)
            .await?;
        let contacts = self.linked_contacts(Entity::Company, &key).await?;
        Ok(CompanyDetail {
            company,
            objects,
            contacts,
        })
    }

    pub async fn write_object(&self, id: Option<Uuid>, input: ObjectInput) -> Result<Uuid> {
        let name = required(&input.name, "Vyplňte název objektu.")?;
        let street = required(&input.street, "Vyplňte ulici.")?;
        let city = required(&input.city, "Vyplňte obec.")?;
        let number = optional(input.building_number.as_deref());
        let postal = optional(input.postal_code.as_deref());
        if [
            input.cold_water_meters,
            input.hot_water_meters,
            input.heat_meters,
            input.rtn_meters,
        ]
        .iter()
        .any(|count| *count < 0)
        {
            return Err(Error::Validation("Počty měřidel musí být nezáporné."));
        }
        let search = fold(&format!(
            "{name} {street} {} {city} {}",
            number.unwrap_or(""),
            postal.unwrap_or("")
        ));
        let now = utc(Utc::now());
        let key = id.unwrap_or_else(Uuid::new_v4);
        let company = input.management_company_id.map(|id| id.to_string());
        let mut tx = self.pool.begin_with("BEGIN IMMEDIATE").await?;

        let previous_company = if id.is_some() {
            ensure_active(&mut tx, "objects", &key.to_string()).await?;
            sqlx::query_scalar::<_, Option<String>>(
                "SELECT management_company_id FROM objects WHERE id = ?",
            )
            .bind(key.to_string())
            .fetch_one(&mut *tx)
            .await?
        } else {
            None
        };
        if let Some(company) = &company
            && Some(company) != previous_company.as_ref()
        {
            ensure_active(&mut tx, "management_companies", company).await?;
        }
        sqlx::query("INSERT INTO objects (id, name, street, building_number, city, postal_code,
            management_company_id, cold_water_meters, hot_water_meters, heat_meters, rtn_meters,
            technical_notes, created_at, updated_at, search_text)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name, street=excluded.street,
              building_number=excluded.building_number, city=excluded.city, postal_code=excluded.postal_code,
              management_company_id=excluded.management_company_id, cold_water_meters=excluded.cold_water_meters,
              hot_water_meters=excluded.hot_water_meters, heat_meters=excluded.heat_meters,
              rtn_meters=excluded.rtn_meters, technical_notes=excluded.technical_notes,
              updated_at=excluded.updated_at, search_text=excluded.search_text")
            .bind(key.to_string()).bind(name).bind(street).bind(number).bind(city).bind(postal)
            .bind(company).bind(input.cold_water_meters).bind(input.hot_water_meters)
            .bind(input.heat_meters).bind(input.rtn_meters).bind(optional(input.technical_notes.as_deref()))
            .bind(&now).bind(&now).bind(search).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(key)
    }

    pub async fn set_object_company(
        &self,
        id: Uuid,
        company_id: Option<Uuid>,
        current_company_id: Option<Uuid>,
    ) -> Result<()> {
        let key = id.to_string();
        let company = company_id.map(|id| id.to_string());
        let expected = current_company_id.map(|id| id.to_string());
        let mut tx = self.pool.begin_with("BEGIN IMMEDIATE").await?;
        ensure_active(&mut tx, "objects", &key).await?;
        if let Some(company) = &company {
            ensure_active(&mut tx, "management_companies", company).await?;
        }
        let result = sqlx::query(
            "UPDATE objects SET management_company_id = ?, updated_at = ?
            WHERE id = ? AND management_company_id IS ?",
        )
        .bind(company)
        .bind(utc(Utc::now()))
        .bind(key)
        .bind(expected)
        .execute(&mut *tx)
        .await?;
        if result.rows_affected() == 0 {
            return Err(Error::Validation(
                "Správce objektu se mezitím změnil. Obnovte přehled.",
            ));
        }
        tx.commit().await?;
        Ok(())
    }

    pub async fn get_object(&self, id: Uuid) -> Result<ObjectDetail> {
        let key = id.to_string();
        let query = format!(
            "SELECT {OBJECT_COLUMNS} FROM objects o
             LEFT JOIN management_companies c ON c.id = o.management_company_id WHERE o.id = ?"
        );
        let object: Object = sqlx::query_as(sqlx::AssertSqlSafe(query))
            .bind(&key)
            .fetch_one(&self.pool)
            .await?;
        let contacts = self.linked_contacts(Entity::Object, &key).await?;
        let company_contacts = match &object.management_company_id {
            Some(company) => self.linked_contacts(Entity::Company, company).await?,
            None => Vec::new(),
        };
        Ok(ObjectDetail {
            object,
            contacts,
            company_contacts,
        })
    }

    pub async fn write_contact(&self, id: Option<Uuid>, input: ContactInput) -> Result<Uuid> {
        let mut tx = self.pool.begin_with("BEGIN IMMEDIATE").await?;
        let key = write_contact_in(&mut tx, id, input).await?;
        tx.commit().await?;
        Ok(key)
    }

    pub async fn create_linked_contact(
        &self,
        entity: Entity,
        id: Uuid,
        input: ContactInput,
        role: Option<String>,
    ) -> Result<Uuid> {
        let mut tx = self.pool.begin_with("BEGIN IMMEDIATE").await?;
        let contact = write_contact_in(&mut tx, None, input).await?;
        super::relationships::assign_contact_in(&mut tx, entity, id, contact, role).await?;
        tx.commit().await?;
        Ok(contact)
    }

    pub async fn list_contacts(&self, archived: bool) -> Result<Vec<Contact>> {
        let items = sqlx::query_as("SELECT * FROM contacts
            WHERE (archived_at IS NOT NULL) = ? ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE, id")
            .bind(archived).fetch_all(&self.pool).await?;
        Ok(items)
    }

    pub async fn get_contact(&self, id: Uuid) -> Result<ContactDetail> {
        let key = id.to_string();
        let contact = sqlx::query_as("SELECT * FROM contacts WHERE id = ?")
            .bind(&key)
            .fetch_one(&self.pool)
            .await?;
        let objects = sqlx::query_as(
            "SELECT o.id, o.name, l.role_label, o.archived_at
            FROM object_contacts l JOIN objects o ON o.id = l.object_id
            WHERE l.contact_id = ? ORDER BY o.name COLLATE NOCASE, o.id",
        )
        .bind(&key)
        .fetch_all(&self.pool)
        .await?;
        let companies = sqlx::query_as("SELECT c.id, c.name, l.role_label, c.archived_at
            FROM management_company_contacts l JOIN management_companies c ON c.id = l.management_company_id
            WHERE l.contact_id = ? ORDER BY c.name COLLATE NOCASE, c.id")
            .bind(&key).fetch_all(&self.pool).await?;
        Ok(ContactDetail {
            contact,
            objects,
            companies,
        })
    }
}

async fn write_contact_in(
    tx: &mut Transaction<'_, Sqlite>,
    id: Option<Uuid>,
    input: ContactInput,
) -> Result<Uuid> {
    let first = required(&input.first_name, "Vyplňte jméno kontaktu.")?;
    let last = required(&input.last_name, "Vyplňte příjmení kontaktu.")?;
    let email = email(input.email.as_deref())?;
    let phone = optional(input.phone.as_deref());
    let normalized = phone
        .map(normalize_phone)
        .filter(|digits| !digits.is_empty());
    let search = fold(&format!(
        "{first} {last} {} {last} {first}",
        email.unwrap_or("")
    ));
    let now = utc(Utc::now());
    let key = id.unwrap_or_else(Uuid::new_v4);
    if id.is_some() {
        ensure_active(tx, "contacts", &key.to_string()).await?;
    }
    sqlx::query("INSERT INTO contacts (id, first_name, last_name, email, phone, phone_normalized,
            notes, created_at, updated_at, search_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET first_name=excluded.first_name, last_name=excluded.last_name,
              email=excluded.email, phone=excluded.phone, phone_normalized=excluded.phone_normalized,
              notes=excluded.notes, updated_at=excluded.updated_at, search_text=excluded.search_text")
            .bind(key.to_string()).bind(first).bind(last).bind(email).bind(phone).bind(normalized)
            .bind(optional(input.notes.as_deref())).bind(&now).bind(&now).bind(search).execute(&mut **tx).await?;
    Ok(key)
}

pub(super) fn target_tables(entity: Entity) -> Result<(&'static str, &'static str, &'static str)> {
    match entity {
        Entity::Object => Ok(("objects", "object_contacts", "object_id")),
        Entity::Company => Ok((
            "management_companies",
            "management_company_contacts",
            "management_company_id",
        )),
        Entity::Contact => Err(Error::Validation("Zvolte objekt nebo správcovskou firmu.")),
    }
}
