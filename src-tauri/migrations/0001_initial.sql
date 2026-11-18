CREATE TABLE management_companies (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    ico TEXT, street TEXT, city TEXT, postal_code TEXT, email TEXT, phone TEXT, notes TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT
);

CREATE TABLE objects (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    street TEXT NOT NULL CHECK (length(trim(street)) > 0),
    building_number TEXT,
    city TEXT NOT NULL CHECK (length(trim(city)) > 0),
    postal_code TEXT,
    management_company_id TEXT REFERENCES management_companies(id),
    cold_water_meters INTEGER NOT NULL DEFAULT 0 CHECK (cold_water_meters BETWEEN 0 AND 2147483647),
    hot_water_meters INTEGER NOT NULL DEFAULT 0 CHECK (hot_water_meters BETWEEN 0 AND 2147483647),
    heat_meters INTEGER NOT NULL DEFAULT 0 CHECK (heat_meters BETWEEN 0 AND 2147483647),
    rtn_meters INTEGER NOT NULL DEFAULT 0 CHECK (rtn_meters BETWEEN 0 AND 2147483647),
    technical_notes TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT,
    search_text TEXT NOT NULL
);

CREATE TABLE contacts (
    id TEXT PRIMARY KEY NOT NULL,
    first_name TEXT NOT NULL CHECK (length(trim(first_name)) > 0),
    last_name TEXT NOT NULL CHECK (length(trim(last_name)) > 0),
    email TEXT, phone TEXT, phone_normalized TEXT, notes TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, archived_at TEXT,
    search_text TEXT NOT NULL
);

CREATE TABLE object_contacts (
    object_id TEXT NOT NULL REFERENCES objects(id),
    contact_id TEXT NOT NULL REFERENCES contacts(id),
    role_label TEXT,
    PRIMARY KEY (object_id, contact_id)
);

CREATE TABLE management_company_contacts (
    management_company_id TEXT NOT NULL REFERENCES management_companies(id),
    contact_id TEXT NOT NULL REFERENCES contacts(id),
    role_label TEXT,
    PRIMARY KEY (management_company_id, contact_id)
);

CREATE TABLE activities (
    id TEXT PRIMARY KEY NOT NULL,
    object_id TEXT NOT NULL REFERENCES objects(id),
    contact_id TEXT REFERENCES contacts(id),
    activity_type TEXT NOT NULL CHECK (activity_type IN ('phone', 'email', 'meeting', 'note')),
    content TEXT NOT NULL CHECK (length(trim(content)) > 0),
    started_at TEXT NOT NULL,
    saved_at TEXT NOT NULL CHECK (saved_at >= started_at),
    updated_at TEXT NOT NULL
);

CREATE INDEX objects_status_creation ON objects(archived_at, created_at DESC, id);
CREATE INDEX objects_company_status ON objects(management_company_id, archived_at, created_at DESC, id);
CREATE INDEX company_status_name ON management_companies(archived_at, name, id);
CREATE INDEX contact_status_name ON contacts(archived_at, last_name, first_name, id);
CREATE INDEX object_contacts_reverse ON object_contacts(contact_id, object_id);
CREATE INDEX company_contacts_reverse ON management_company_contacts(contact_id, management_company_id);
CREATE INDEX activities_object_time ON activities(object_id, started_at DESC, saved_at DESC, id DESC);
CREATE INDEX activities_contact ON activities(contact_id);

CREATE VIRTUAL TABLE object_search USING fts5(id UNINDEXED, text, tokenize='trigram case_sensitive 1');
CREATE VIRTUAL TABLE contact_search USING fts5(id UNINDEXED, text, phone, tokenize='trigram case_sensitive 1');

CREATE TRIGGER objects_search_insert AFTER INSERT ON objects BEGIN
    INSERT INTO object_search(id, text) VALUES (new.id, new.search_text);
END;
CREATE TRIGGER objects_search_update AFTER UPDATE OF search_text ON objects BEGIN
    UPDATE object_search SET text = new.search_text WHERE id = old.id;
END;
CREATE TRIGGER objects_search_delete AFTER DELETE ON objects BEGIN
    DELETE FROM object_search WHERE id = old.id;
END;
CREATE TRIGGER contacts_search_insert AFTER INSERT ON contacts BEGIN
    INSERT INTO contact_search(id, text, phone)
    VALUES (new.id, new.search_text, new.phone_normalized);
END;
CREATE TRIGGER contacts_search_update AFTER UPDATE OF search_text, phone_normalized ON contacts BEGIN
    UPDATE contact_search SET text = new.search_text, phone = new.phone_normalized WHERE id = old.id;
END;
CREATE TRIGGER contacts_search_delete AFTER DELETE ON contacts BEGIN
    DELETE FROM contact_search WHERE id = old.id;
END;
