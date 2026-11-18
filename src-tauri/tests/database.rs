use chrono::{Duration, Utc};
use profitherm_crm::{
    database::{Database, Error},
    models::*,
};
use sqlx::Connection;
use sqlx::sqlite::{SqliteConnectOptions, SqliteConnection};
use tempfile::TempDir;
use uuid::Uuid;

async fn fixture() -> (TempDir, Database) {
    let folder = tempfile::tempdir().unwrap();
    let db = Database::open(&folder.path().join("profitherm.db"))
        .await
        .unwrap();
    (folder, db)
}

fn object(name: &str, company: Option<Uuid>) -> ObjectInput {
    ObjectInput {
        name: name.into(),
        street: "Česká".into(),
        building_number: Some("21/7".into()),
        city: "Plzeň".into(),
        postal_code: Some("301 00".into()),
        management_company_id: company,
        cold_water_meters: 15,
        hot_water_meters: 6,
        heat_meters: 2,
        rtn_meters: 3,
        technical_notes: Some("Uzávěr ve sklepě".into()),
    }
}

fn company(name: &str) -> CompanyInput {
    CompanyInput {
        name: name.into(),
        ico: None,
        street: None,
        city: None,
        postal_code: None,
        email: None,
        phone: None,
        notes: None,
    }
}

fn contact() -> ContactInput {
    ContactInput {
        first_name: "Šárka".into(),
        last_name: "Říhová".into(),
        email: Some("rihova@example.test".into()),
        phone: Some("+420 (777) 123 456".into()),
        notes: None,
    }
}

fn activity(id: Uuid, minutes_ago: i64) -> ActivityInput {
    ActivityInput {
        object_id: id,
        contact_id: None,
        activity_type: ActivityType::Phone,
        content: "  Domluvena prohlídka.  ".into(),
        started_at: Utc::now() - Duration::minutes(minutes_ago),
    }
}

async fn ids(db: &Database, search: ObjectSearch) -> Vec<String> {
    db.search_objects(search)
        .await
        .unwrap()
        .items
        .into_iter()
        .map(|object| object.id)
        .collect()
}

#[tokio::test]
async fn data_persists_after_reopening() {
    let (folder, db) = fixture().await;
    let object_id = db.write_object(None, object("Dům B", None)).await.unwrap();
    db.create_activity(activity(object_id, 5)).await.unwrap();
    db.close().await;
    let db = Database::open(&folder.path().join("profitherm.db"))
        .await
        .unwrap();
    let stored = db.get_object(object_id).await.unwrap().object;
    assert_eq!(stored.name, "Dům B");
    assert_eq!(stored.cold_water_meters, 15);
    assert_eq!(db.list_object_activities(object_id).await.unwrap().len(), 1);
}

#[tokio::test]
async fn company_lists_three_objects_and_assignment_can_be_removed() {
    let (_folder, db) = fixture().await;
    let firm = db
        .write_company(None, company("Správa města"))
        .await
        .unwrap();
    for name in ["První", "Druhý", "Třetí"] {
        let id = db.write_object(None, object(name, None)).await.unwrap();
        db.set_object_company(id, Some(firm), None).await.unwrap();
    }
    let detail = db.get_company(firm).await.unwrap();
    assert_eq!(detail.objects.len(), 3);
    let id = Uuid::parse_str(&detail.objects[0].id).unwrap();
    assert!(db.set_object_company(id, None, None).await.is_err());
    db.set_object_company(id, None, Some(firm)).await.unwrap();
    assert_eq!(db.get_company(firm).await.unwrap().objects.len(), 2);
    assert!(
        db.get_object(id)
            .await
            .unwrap()
            .object
            .management_company_id
            .is_none()
    );
}

#[tokio::test]
async fn independent_objects_and_address_search() {
    let (_folder, db) = fixture().await;
    let id = db
        .write_object(None, object("Dům", None))
        .await
        .unwrap()
        .to_string();
    for query in ["DUM", "CESKA 21/7", "21/7", "PLZEN", "301 00", "Du"] {
        assert_eq!(
            ids(
                &db,
                ObjectSearch {
                    query: Some(query.into()),
                    ..Default::default()
                }
            )
            .await,
            [id.clone()]
        );
    }
    assert!(
        ids(
            &db,
            ObjectSearch {
                query: Some("\" OR \"".into()),
                ..Default::default()
            }
        )
        .await
        .is_empty()
    );
    // Same address and name are valid for multiple entities.
    assert_ne!(
        db.write_object(None, object("Dům", None))
            .await
            .unwrap()
            .to_string(),
        id
    );
}

#[tokio::test]
async fn shared_contact_search_and_reverse_assignment() {
    let (_folder, db) = fixture().await;
    let a = db.write_object(None, object("A", None)).await.unwrap();
    let b = db.write_object(None, object("B", None)).await.unwrap();
    let person = db.write_contact(None, contact()).await.unwrap();
    for id in [a, b] {
        db.assign_contact(Entity::Object, id, person, Some("Předsedkyně".into()))
            .await
            .unwrap();
    }
    assert!(matches!(
        db.assign_contact(Entity::Object, a, person, None).await,
        Err(Error::Duplicate)
    ));
    for search in [
        "SARKA RIHOVA",
        "Říhová Šárka",
        "rihova@example.test",
        "00420 777 123 456",
        "777-123-456",
        "420777123456",
    ] {
        let results = ids(
            &db,
            ObjectSearch {
                contact_query: Some(search.into()),
                ..Default::default()
            },
        )
        .await;
        assert_eq!(results.len(), 2);
        assert!(results.contains(&a.to_string()) && results.contains(&b.to_string()));
    }
    assert_eq!(db.get_contact(person).await.unwrap().objects.len(), 2);
    db.remove_contact(Entity::Object, a, person).await.unwrap();
    assert_eq!(db.get_contact(person).await.unwrap().objects.len(), 1);
}

#[tokio::test]
async fn manager_contact_matches_all_its_objects_and_multiple_companies() {
    let (_folder, db) = fixture().await;
    let a = db.write_company(None, company("První")).await.unwrap();
    let b = db.write_company(None, company("Druhá")).await.unwrap();
    let person = db
        .create_linked_contact(Entity::Company, a, contact(), Some("Dispečink".into()))
        .await
        .unwrap();
    db.assign_contact(Entity::Company, b, person, None)
        .await
        .unwrap();
    for index in 0..15 {
        db.write_object(None, object(&format!("Dům {index}"), Some(a)))
            .await
            .unwrap();
    }
    db.write_object(None, object("Dům jiné firmy", Some(b)))
        .await
        .unwrap();
    db.write_object(None, object("Nezávislý", None))
        .await
        .unwrap();
    assert_eq!(
        db.get_company(a).await.unwrap().contacts[0]
            .role_label
            .as_deref(),
        Some("Dispečink")
    );
    assert_eq!(db.get_contact(person).await.unwrap().companies.len(), 2);
    assert_eq!(
        ids(
            &db,
            ObjectSearch {
                contact_query: Some("říhová".into()),
                ..Default::default()
            }
        )
        .await
        .len(),
        16
    );
}

#[tokio::test]
async fn activity_preserves_editor_time_and_rejects_empty_content() {
    let (_folder, db) = fixture().await;
    let id = db.write_object(None, object("Dům", None)).await.unwrap();
    let mut empty = activity(id, 4);
    empty.content = " \n\t ".into();
    assert!(matches!(
        db.create_activity(empty).await,
        Err(Error::Validation(_))
    ));
    let input = activity(id, 5);
    let started = input.started_at;
    db.create_activity(input).await.unwrap();
    let items = db.list_object_activities(id).await.unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(
        items[0]
            .started_at
            .parse::<chrono::DateTime<Utc>>()
            .unwrap()
            .timestamp_millis(),
        started.timestamp_millis()
    );
    assert!(items[0].saved_at > items[0].started_at);
    assert_eq!(items[0].updated_at, items[0].saved_at);
    assert_eq!(items[0].content, "Domluvena prohlídka.");
}

#[tokio::test]
async fn ordering_uses_activity_start_time_and_ignores_object_edits() {
    let (_folder, db) = fixture().await;
    let a = db.write_object(None, object("A", None)).await.unwrap();
    let b = db.write_object(None, object("B", None)).await.unwrap();
    let c = db.write_object(None, object("C", None)).await.unwrap();

    let newer = db.create_activity(activity(b, 2)).await.unwrap();
    db.create_activity(activity(a, 5)).await.unwrap();
    db.create_activity(activity(b, 10)).await.unwrap();
    let list = db.list_object_activities(b).await.unwrap();
    assert_eq!(list[0].id, newer.to_string());
    db.write_object(Some(a), object("Přejmenováno", None))
        .await
        .unwrap();
    assert_eq!(
        ids(&db, ObjectSearch::default()).await,
        [b, a, c].map(|id| id.to_string())
    );
}

#[tokio::test]
async fn contact_company_and_address_filters_combine_on_paginated_search() {
    let (_folder, db) = fixture().await;
    let a = db.write_company(None, company("První")).await.unwrap();
    let b = db.write_company(None, company("Druhá")).await.unwrap();
    let person = db.write_contact(None, contact()).await.unwrap();
    for firm in [a, b] {
        db.assign_contact(Entity::Company, firm, person, None)
            .await
            .unwrap();
    }
    for index in 0..26 {
        db.write_object(None, object(&format!("První {index}"), Some(a)))
            .await
            .unwrap();
    }
    db.write_object(None, object("Druhá", Some(b)))
        .await
        .unwrap();
    let filter = |page| ObjectSearch {
        query: Some("Plzen".into()),
        contact_query: Some("777 123".into()),
        company_id: Some(a),
        page: Some(page),
        ..Default::default()
    };
    let first = db.search_objects(filter(0)).await.unwrap();
    let second = db.search_objects(filter(1)).await.unwrap();
    assert_eq!(first.total, 26);
    assert_eq!(first.items.len(), 25);
    assert_eq!(second.items.len(), 1);
    assert!(!first.items.iter().any(|item| item.id == second.items[0].id));
    assert!(
        first
            .items
            .iter()
            .all(|item| item.management_company_id.as_deref() == Some(&a.to_string()))
    );
}

#[tokio::test]
async fn meter_counts_and_missing_references_are_rejected() {
    let (_folder, db) = fixture().await;
    let mut invalid = object("Záporný", None);
    invalid.hot_water_meters = -1;
    assert!(matches!(
        db.write_object(None, invalid).await,
        Err(Error::Validation(_))
    ));
    assert!(matches!(
        db.write_object(None, object("Neznámý", Some(Uuid::new_v4())))
            .await,
        Err(Error::NotFound)
    ));
    assert!(
        db.create_linked_contact(Entity::Object, Uuid::new_v4(), contact(), None)
            .await
            .is_err()
    );
    assert!(db.list_contacts(false).await.unwrap().is_empty());
    assert!(ids(&db, ObjectSearch::default()).await.is_empty());
}

#[tokio::test]
async fn database_backup_is_integral_searchable_and_cannot_overwrite() {
    let (folder, db) = fixture().await;
    let building = db
        .write_object(None, object("Zálohovaný", None))
        .await
        .unwrap();
    db.create_linked_contact(Entity::Object, building, contact(), None)
        .await
        .unwrap();
    db.create_activity(activity(building, 1)).await.unwrap();
    let path = folder.path().join("záloha.db");
    db.create_database_backup(&path).await.unwrap();
    assert!(matches!(
        db.create_database_backup(&path).await,
        Err(Error::BackupExists)
    ));
    let mut backup = SqliteConnection::connect_with(
        &SqliteConnectOptions::new().filename(&path).read_only(true),
    )
    .await
    .unwrap();
    let status: String = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(&mut backup)
        .await
        .unwrap();
    assert_eq!(status, "ok");
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM activities WHERE object_id = ?")
        .bind(building.to_string())
        .fetch_one(&mut backup)
        .await
        .unwrap();
    assert_eq!(count, 1);
    backup.close().await.unwrap();
    let restored = Database::open(&path).await.unwrap();
    assert_eq!(
        ids(
            &restored,
            ObjectSearch {
                query: Some("ZALOHOVANY".into()),
                contact_query: Some("RIHOVA".into()),
                ..Default::default()
            }
        )
        .await,
        [building.to_string()]
    );
}

#[tokio::test]
async fn archiving_preserves_records_and_relationships_and_allows_restore() {
    let (_folder, db) = fixture().await;
    let firm = db.write_company(None, company("Správa")).await.unwrap();
    let building = db
        .write_object(None, object("Archiv", Some(firm)))
        .await
        .unwrap();
    let contact = db
        .create_linked_contact(Entity::Company, firm, contact(), None)
        .await
        .unwrap();
    db.create_activity(activity(building, 5)).await.unwrap();
    db.set_archive(Entity::Company, firm, true).await.unwrap();
    assert!(db.list_companies(false).await.unwrap().is_empty());
    assert_eq!(db.get_company(firm).await.unwrap().contacts.len(), 1);
    assert_eq!(db.get_contact(contact).await.unwrap().companies.len(), 1);
    assert_eq!(
        ids(&db, ObjectSearch::default()).await,
        [building.to_string()]
    );
    db.set_archive(Entity::Object, building, true)
        .await
        .unwrap();
    assert!(ids(&db, ObjectSearch::default()).await.is_empty());
    assert_eq!(
        ids(
            &db,
            ObjectSearch {
                archived: Some(true),
                ..Default::default()
            }
        )
        .await,
        [building.to_string()]
    );
    assert_eq!(db.list_object_activities(building).await.unwrap().len(), 1);
    assert!(matches!(
        db.write_object(Some(building), object("Změněn", None))
            .await,
        Err(Error::Archived)
    ));
    db.set_archive(Entity::Object, building, false)
        .await
        .unwrap();
    assert_eq!(
        db.get_object(building)
            .await
            .unwrap()
            .object
            .management_company_id,
        Some(firm.to_string())
    );
}

#[tokio::test]
async fn empty_database_migrates_and_returns_an_empty_page() {
    let (folder, db) = fixture().await;
    let page = db.search_objects(ObjectSearch::default()).await.unwrap();
    assert!(folder.path().join("profitherm.db").exists());
    assert!(page.items.is_empty());
    assert_eq!(page.total, 0);
    assert_eq!(page.page, 0);
}

#[tokio::test]
async fn editing_reindexes_text_and_archived_contacts_stop_matching() {
    let (_folder, db) = fixture().await;
    let building = db
        .write_object(None, object("Původní", None))
        .await
        .unwrap();
    let person = db
        .create_linked_contact(Entity::Object, building, contact(), None)
        .await
        .unwrap();
    db.write_object(Some(building), object("Přejmenovaný", None))
        .await
        .unwrap();
    assert!(
        ids(
            &db,
            ObjectSearch {
                query: Some("PUVODNI".into()),
                ..Default::default()
            }
        )
        .await
        .is_empty()
    );
    assert_eq!(
        ids(
            &db,
            ObjectSearch {
                query: Some("PREJMENOVANY".into()),
                ..Default::default()
            }
        )
        .await,
        [building.to_string()]
    );
    let mut renamed = contact();
    renamed.last_name = "Štěpánová".into();
    renamed.email = Some("stepanova@example.test".into());
    db.write_contact(Some(person), renamed).await.unwrap();
    assert!(
        ids(
            &db,
            ObjectSearch {
                contact_query: Some("RIHOVA".into()),
                ..Default::default()
            }
        )
        .await
        .is_empty()
    );
    assert_eq!(
        ids(
            &db,
            ObjectSearch {
                contact_query: Some("STEPANOVA".into()),
                ..Default::default()
            }
        )
        .await,
        [building.to_string()]
    );
    db.set_archive(Entity::Contact, person, true).await.unwrap();
    assert!(
        ids(
            &db,
            ObjectSearch {
                contact_query: Some("STEPANOVA".into()),
                ..Default::default()
            }
        )
        .await
        .is_empty()
    );
    assert_eq!(db.get_object(building).await.unwrap().contacts.len(), 1);
}
