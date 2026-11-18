// intent: migration safety for 0007 on a database that already holds case-duplicate graph entities.
// Applies 0001-0006 and 0007 inside one transaction on a dedicated empty disposable database and
// rolls back, so the database stays empty and the test can be repeated. Synthetic fixture rows only.
// status: done | next: none | confidence: high
use sqlx::Connection;
use uuid::Uuid;

// Separate disposable database in the same test cluster: purpose 'test' marker, empty product schema.
const MIGRATION_DB: &str = "postgresql://noti_school_migrator:synthetic-test-only@127.0.0.1:54390/noti_school_test_api2_mig";

fn migration(name: &str) -> String {
    std::fs::read_to_string(format!(
        "{}/../../migrations/{name}",
        env!("CARGO_MANIFEST_DIR")
    ))
    .unwrap()
}

#[tokio::test]
#[ignore = "requires the empty disposable noti_school_test_api2_mig database"]
async fn migration_0007_merges_case_duplicate_graph_entities() {
    let mut conn = sqlx::PgConnection::connect(MIGRATION_DB).await.unwrap();
    let (purpose, tables): (String, i64) = sqlx::query_as("SELECT (SELECT purpose FROM noti_meta.identity WHERE singleton),(SELECT count(*) FROM pg_tables WHERE schemaname='product')")
        .fetch_one(&mut conn).await.unwrap();
    assert_eq!(
        (purpose.as_str(), tables),
        ("test", 0),
        "needs an empty disposable test database"
    );
    let mut tx = conn.begin().await.unwrap();
    for name in [
        "0001_product.sql",
        "0002_budget.sql",
        "0003_idempotency.sql",
        "0004_pipeline.sql",
        "0005_audit_hardening.sql",
        "0006_budget_reconcile.sql",
    ] {
        sqlx::raw_sql(sqlx::AssertSqlSafe(migration(name)))
            .execute(&mut *tx)
            .await
            .unwrap_or_else(|e| panic!("{name}: {e}"));
    }
    let (school, other) = (Uuid::new_v4(), Uuid::new_v4());
    let (source, version, chunk) = (Uuid::new_v4(), Uuid::new_v4(), Uuid::new_v4());
    for i in [school, other] {
        sqlx::query("INSERT INTO product.institutions(id,slug,name) VALUES($1,$2,'Example University (synthetic)')")
            .bind(i).bind(format!("synthetic-mig-{i}")).execute(&mut *tx).await.unwrap();
    }
    sqlx::query("INSERT INTO product.sources(id,institution_id,title,kind,visibility) VALUES($1,$2,'Synthetic source','text','institution')")
        .bind(source).bind(school).execute(&mut *tx).await.unwrap();
    sqlx::query("INSERT INTO product.source_versions(id,institution_id,source_id,label,sha256,storage_key) VALUES($1,$2,$3,'Synthetic v1',$4,$5)")
        .bind(version).bind(school).bind(source).bind("a".repeat(64)).bind(format!("synthetic-{version}")).execute(&mut *tx).await.unwrap();
    sqlx::query("INSERT INTO product.chunks(id,institution_id,source_id,version_id,ordinal,content,language,section,start_char,end_char) VALUES($1,$2,$3,$4,0,'Synthetic evidence.','en','Text',0,19)")
        .bind(chunk).bind(school).bind(source).bind(version).execute(&mut *tx).await.unwrap();
    // The oldest entity gets the largest id, so neither id order nor label case picks the survivor.
    let oldest = Uuid::parse_str("ffffffff-0000-4000-8000-000000000001").unwrap();
    let newer = Uuid::parse_str("00000000-0000-4000-8000-000000000002").unwrap();
    let newest = Uuid::parse_str("00000000-0000-4000-8000-000000000001").unwrap();
    let form = Uuid::new_v4();
    let course = Uuid::new_v4();
    let other_office = Uuid::new_v4();
    // Separate subtransactions give each entity its own, increasing xmin, like separate requests.
    for (n, (id, institution, kind, label)) in [
        (oldest, school, "office", "Synthetic Office"),
        (newer, school, "office", "synthetic office"),
        (newest, school, "office", "SYNTHETIC OFFICE"),
        (form, school, "form", "Synthetic blue form"),
        (course, school, "course", "Synthetic Office"),
        (other_office, other, "office", "synthetic office"),
    ]
    .into_iter()
    .enumerate()
    {
        sqlx::raw_sql(sqlx::AssertSqlSafe(format!("SAVEPOINT entity_{n}")))
            .execute(&mut *tx)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO product.graph_entities(id,institution_id,kind,label) VALUES($1,$2,$3,$4)",
        )
        .bind(id)
        .bind(institution)
        .bind(kind)
        .bind(label)
        .execute(&mut *tx)
        .await
        .unwrap();
        sqlx::raw_sql(sqlx::AssertSqlSafe(format!("RELEASE SAVEPOINT entity_{n}")))
            .execute(&mut *tx)
            .await
            .unwrap();
    }
    let edges = [
        (Uuid::new_v4(), newer, form, "approved"),
        (Uuid::new_v4(), form, newest, "candidate"),
        (Uuid::new_v4(), oldest, form, "rejected"),
        (Uuid::new_v4(), newer, newest, "candidate"),
    ];
    for (id, from, to, status) in edges {
        sqlx::query("INSERT INTO product.graph_edges(id,institution_id,from_entity_id,to_entity_id,relation,status,evidence_chunk_id,approved_by) VALUES($1,$2,$3,$4,'accepts',$5,$6,CASE WHEN $5='approved' THEN 'synthetic-admin' END)")
            .bind(id).bind(school).bind(from).bind(to).bind(status).bind(chunk).execute(&mut *tx).await.unwrap();
    }
    sqlx::raw_sql(sqlx::AssertSqlSafe(migration("0007_web_evidence.sql")))
        .execute(&mut *tx)
        .await
        .expect("0007 applies over case duplicates");

    let offices: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT id,label FROM product.graph_entities WHERE institution_id=$1 AND kind='office'",
    )
    .bind(school)
    .fetch_all(&mut *tx)
    .await
    .unwrap();
    assert_eq!(offices, [(oldest, "Synthetic Office".to_owned())]);
    let untouched: i64 =
        sqlx::query_scalar("SELECT count(*) FROM product.graph_entities WHERE id IN ($1,$2,$3)")
            .bind(form)
            .bind(course)
            .bind(other_office)
            .fetch_one(&mut *tx)
            .await
            .unwrap();
    assert_eq!(
        untouched, 3,
        "other kinds and other institutions are never merged"
    );
    let after: Vec<(Uuid, Uuid, Uuid, String, Uuid, Option<String>)> = sqlx::query_as("SELECT id,from_entity_id,to_entity_id,status,evidence_chunk_id,approved_by FROM product.graph_edges WHERE institution_id=$1")
        .bind(school).fetch_all(&mut *tx).await.unwrap();
    assert_eq!(after.len(), edges.len(), "no edge is deleted");
    for (id, from, to, status) in edges {
        let merge = |e: Uuid| {
            if [newer, newest].contains(&e) {
                oldest
            } else {
                e
            }
        };
        let row = after.iter().find(|r| r.0 == id).unwrap();
        assert_eq!(
            (row.1, row.2, row.3.as_str(), row.4),
            (merge(from), merge(to), status, chunk)
        );
        assert_eq!(
            row.5.is_some(),
            status == "approved",
            "approval provenance kept"
        );
    }
    let view: bool = sqlx::query_scalar("SELECT to_regclass('product.graph_entity_merge') IS NULL")
        .fetch_one(&mut *tx)
        .await
        .unwrap();
    assert!(view, "the transient merge view is dropped");
    sqlx::raw_sql("SAVEPOINT duplicate")
        .execute(&mut *tx)
        .await
        .unwrap();
    assert!(
        sqlx::query("INSERT INTO product.graph_entities(id,institution_id,kind,label) VALUES($1,$2,'office','SYNTHETIC office')")
            .bind(Uuid::new_v4()).bind(school).execute(&mut *tx).await.is_err(),
        "case duplicates are rejected after 0007"
    );
    sqlx::raw_sql("ROLLBACK TO SAVEPOINT duplicate")
        .execute(&mut *tx)
        .await
        .unwrap();
    tx.rollback().await.unwrap();
    let left: i64 = sqlx::query_scalar("SELECT count(*) FROM pg_tables WHERE schemaname='product'")
        .fetch_one(&mut conn)
        .await
        .unwrap();
    assert_eq!(left, 0, "rolled back; the disposable database stays empty");
    println!(
        "PASS migration 0007: case-duplicate entities merged into the oldest, edges repointed"
    );
}
