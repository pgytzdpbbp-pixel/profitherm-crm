mod activities;
mod records;
mod relationships;
mod search;

use std::path::Path;
use std::time::Duration;

use chrono::{DateTime, SecondsFormat, Utc};
use sqlx::SqlitePool;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use unicode_normalization::{UnicodeNormalization, char::is_combining_mark};
use uuid::Uuid;

use crate::models::Entity;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    Validation(&'static str),
    #[error("Záznam nebyl nalezen.")]
    NotFound,
    #[error("Tomuto záznamu obnovte aktivní stav, než jej upravíte.")]
    Archived,
    #[error("Uvedený kontakt je již přiřazen.")]
    Duplicate,
    #[error("Záložní soubor už existuje. Zvolte jiný název.")]
    BackupExists,
    #[error("Zálohu se nepodařilo zapsat do vybraného umístění.")]
    BackupIo(#[source] std::io::Error),
    #[error("Databázovou operaci se nepodařilo dokončit.")]
    Sql(#[source] sqlx::Error),
    #[error("Databázi se nepodařilo bezpečně aktualizovat.")]
    Migration(#[from] sqlx::migrate::MigrateError),
}

impl From<sqlx::Error> for Error {
    fn from(error: sqlx::Error) -> Self {
        match error {
            sqlx::Error::RowNotFound => Self::NotFound,
            other
                if other
                    .as_database_error()
                    .is_some_and(|e| e.is_foreign_key_violation()) =>
            {
                Self::Validation("Vybraný související záznam neexistuje.")
            }
            other => Self::Sql(other),
        }
    }
}

pub type Result<T> = std::result::Result<T, Error>;

pub struct Database {
    pool: SqlitePool,
}

impl Database {
    pub async fn open(path: &Path) -> Result<Self> {
        let options = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true)
            .foreign_keys(true)
            .journal_mode(SqliteJournalMode::Wal)
            .busy_timeout(Duration::from_secs(5));
        let pool = SqlitePoolOptions::new()
            .max_connections(4)
            .connect_with(options)
            .await?;
        sqlx::migrate!().run(&pool).await?;
        Ok(Self { pool })
    }

    pub async fn close(&self) {
        self.pool.close().await;
    }

    pub async fn set_archive(&self, entity: Entity, id: Uuid, archived: bool) -> Result<()> {
        let table = match entity {
            Entity::Company => "management_companies",
            Entity::Object => "objects",
            Entity::Contact => "contacts",
        };
        let now = utc(Utc::now());
        let statement = format!(
            "UPDATE {table} SET archived_at = CASE WHEN ? THEN coalesce(archived_at, ?) END,
             updated_at = ? WHERE id = ?"
        );
        let result = sqlx::query(sqlx::AssertSqlSafe(statement))
            .bind(archived)
            .bind(&now)
            .bind(&now)
            .bind(id.to_string())
            .execute(&self.pool)
            .await?;
        if result.rows_affected() == 0 {
            return Err(Error::NotFound);
        }
        Ok(())
    }
}

fn utc(date: DateTime<Utc>) -> String {
    date.to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn required<'a>(value: &'a str, message: &'static str) -> Result<&'a str> {
    let value = value.trim();
    if value.is_empty() {
        return Err(Error::Validation(message));
    }
    Ok(value)
}

fn optional(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

fn email(value: Option<&str>) -> Result<Option<&str>> {
    let value = optional(value);
    if let Some(address) = value {
        let valid = address.split_once('@').is_some_and(|(local, domain)| {
            !local.is_empty()
                && domain.split('.').count() >= 2
                && domain.split('.').all(|part| !part.is_empty())
                && !domain.contains('@')
                && !address.chars().any(char::is_whitespace)
        });
        if !valid {
            return Err(Error::Validation("Zadejte platnou e-mailovou adresu."));
        }
    }
    Ok(value)
}

fn fold(value: &str) -> String {
    let text: String = value
        .nfd()
        .filter(|c| !is_combining_mark(*c) && (!c.is_control() || c.is_whitespace()))
        .flat_map(char::to_lowercase)
        .collect();
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn normalize_phone(value: &str) -> String {
    let digits: String = value.chars().filter(char::is_ascii_digit).collect();
    if digits.len() == 14 && digits.starts_with("00420") {
        return digits[5..].to_owned();
    }
    if digits.len() == 12 && digits.starts_with("420") {
        return digits[3..].to_owned();
    }
    digits
}
