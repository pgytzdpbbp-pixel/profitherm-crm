use sqlx::{QueryBuilder, Sqlite};

use super::records::OBJECT_COLUMNS;
use super::{Database, Result, fold, normalize_phone};
use crate::models::{ObjectPage, ObjectSearch};

const PAGE_SIZE: u32 = 25;

// Quoting turns punctuation and FTS operators into literal search text.
fn phrase(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

struct Filters {
    query: String,
    contact: String,
    phone: Option<String>,
    company: Option<String>,
    archived: bool,
}

impl Filters {
    fn prefix(&self) -> QueryBuilder<Sqlite> {
        let mut sql = QueryBuilder::new("");
        if self.contact.is_empty() {
            return sql;
        }
        sql.push(
            "WITH matching_contacts AS (
            SELECT c.id FROM contacts c WHERE c.archived_at IS NULL AND (",
        );
        if self.contact.chars().count() >= 3 {
            sql.push("c.id IN (SELECT id FROM contact_search WHERE text MATCH ")
                .push_bind(phrase(&self.contact))
                .push(")");
        } else {
            sql.push("instr(c.search_text, ")
                .push_bind(self.contact.clone())
                .push(") > 0");
        }
        if let Some(phone) = &self.phone {
            if phone.len() >= 3 {
                sql.push(" OR c.id IN (SELECT id FROM contact_search WHERE phone MATCH ")
                    .push_bind(phrase(phone))
                    .push(")");
            } else {
                sql.push(" OR instr(c.phone_normalized, ")
                    .push_bind(phone.clone())
                    .push(") > 0");
            }
        }
        sql.push(")) ");
        sql
    }

    fn apply(&self, sql: &mut QueryBuilder<Sqlite>) {
        sql.push(if self.archived {
            " WHERE o.archived_at IS NOT NULL"
        } else {
            " WHERE o.archived_at IS NULL"
        });
        if let Some(company) = &self.company {
            sql.push(" AND o.management_company_id = ")
                .push_bind(company.clone());
        }
        if !self.query.is_empty() {
            if self.query.chars().count() >= 3 {
                sql.push(" AND o.id IN (SELECT id FROM object_search WHERE text MATCH ")
                    .push_bind(phrase(&self.query))
                    .push(")");
            } else {
                sql.push(" AND instr(o.search_text, ")
                    .push_bind(self.query.clone())
                    .push(") > 0");
            }
        }
        if !self.contact.is_empty() {
            sql.push(" AND (o.id IN (
                SELECT oc.object_id FROM matching_contacts m JOIN object_contacts oc ON oc.contact_id = m.id)
                OR o.management_company_id IN (
                SELECT cc.management_company_id FROM matching_contacts m
                JOIN management_company_contacts cc ON cc.contact_id = m.id))");
        }
    }
}

impl Database {
    pub async fn search_objects(&self, input: ObjectSearch) -> Result<ObjectPage> {
        let query = fold(input.query.as_deref().unwrap_or(""));
        let contact = fold(input.contact_query.as_deref().unwrap_or(""));
        let phone = if contact
            .chars()
            .all(|c| c.is_ascii_digit() || "+ ()-./".contains(c))
        {
            let phone = normalize_phone(&contact);
            (!phone.is_empty()).then_some(phone)
        } else {
            None
        };
        let filters = Filters {
            query,
            contact,
            phone,
            company: input.company_id.map(|id| id.to_string()),
            archived: input.archived.unwrap_or(false),
        };

        let mut tx = self.pool.begin().await?;
        let mut count = filters.prefix();
        count.push("SELECT count(*) FROM objects o");
        filters.apply(&mut count);
        let total: i64 = count.build_query_scalar().fetch_one(&mut *tx).await?;
        let last_page = u32::try_from((total.saturating_sub(1).max(0)) / i64::from(PAGE_SIZE))
            .unwrap_or(u32::MAX);
        let page = input.page.unwrap_or(0).min(last_page);
        let mut sql = filters.prefix();
        sql.push(format!(
            "SELECT {OBJECT_COLUMNS} FROM objects o
            LEFT JOIN management_companies c ON c.id = o.management_company_id"
        ));
        filters.apply(&mut sql);
        sql.push(" ORDER BY last_activity_at DESC, o.created_at DESC, o.id LIMIT ")
            .push_bind(PAGE_SIZE)
            .push(" OFFSET ")
            .push_bind(i64::from(page) * i64::from(PAGE_SIZE));
        let items = sql.build_query_as().fetch_all(&mut *tx).await?;
        tx.commit().await?;
        Ok(ObjectPage {
            items,
            page,
            page_size: PAGE_SIZE,
            total,
        })
    }
}
