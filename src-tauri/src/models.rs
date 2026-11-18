use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanyInput {
    pub name: String,
    pub ico: Option<String>,
    pub street: Option<String>,
    pub city: Option<String>,
    pub postal_code: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Company {
    pub id: String,
    pub name: String,
    pub ico: Option<String>,
    pub street: Option<String>,
    pub city: Option<String>,
    pub postal_code: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectInput {
    pub name: String,
    pub street: String,
    pub building_number: Option<String>,
    pub city: String,
    pub postal_code: Option<String>,
    pub management_company_id: Option<Uuid>,
    pub cold_water_meters: i32,
    pub hot_water_meters: i32,
    pub heat_meters: i32,
    pub rtn_meters: i32,
    pub technical_notes: Option<String>,
}

#[derive(Debug, FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Object {
    pub id: String,
    pub name: String,
    pub street: String,
    pub building_number: Option<String>,
    pub city: String,
    pub postal_code: Option<String>,
    pub management_company_id: Option<String>,
    pub management_company_name: Option<String>,
    pub management_company_archived_at: Option<String>,
    pub cold_water_meters: i32,
    pub hot_water_meters: i32,
    pub heat_meters: i32,
    pub rtn_meters: i32,
    pub technical_notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
    pub last_activity_at: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectSearch {
    pub query: Option<String>,
    pub contact_query: Option<String>,
    pub company_id: Option<Uuid>,
    pub page: Option<u32>,
    pub archived: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectPage {
    pub items: Vec<Object>,
    pub page: u32,
    pub page_size: u32,
    pub total: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactInput {
    pub first_name: String,
    pub last_name: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Contact {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub phone_normalized: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
}

#[derive(Debug, FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkedContact {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub role_label: Option<String>,
    pub archived_at: Option<String>,
}

#[derive(Debug, FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkedRecord {
    pub id: String,
    pub name: String,
    pub role_label: Option<String>,
    pub archived_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompanyDetail {
    pub company: Company,
    pub objects: Vec<Object>,
    pub contacts: Vec<LinkedContact>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ObjectDetail {
    pub object: Object,
    pub contacts: Vec<LinkedContact>,
    pub company_contacts: Vec<LinkedContact>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactDetail {
    pub contact: Contact,
    pub objects: Vec<LinkedRecord>,
    pub companies: Vec<LinkedRecord>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "TEXT", rename_all = "snake_case")]
pub enum ActivityType {
    Phone,
    Email,
    Meeting,
    Note,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityInput {
    pub object_id: Uuid,
    pub contact_id: Option<Uuid>,
    pub activity_type: ActivityType,
    pub content: String,
    pub started_at: DateTime<Utc>,
}

#[derive(Debug, FromRow, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    pub id: String,
    pub object_id: String,
    pub contact_id: Option<String>,
    pub contact_name: Option<String>,
    pub activity_type: ActivityType,
    pub content: String,
    pub started_at: String,
    pub saved_at: String,
    pub updated_at: String,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Entity {
    Company,
    Object,
    Contact,
}
