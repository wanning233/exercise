import { test, expect } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { newJournal } from "../src/model";

test("migration enforces private reads, atomic revisions, history, and photo ownership", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.test_uid', true), '') $$;
      GRANT USAGE ON SCHEMA auth TO authenticated, anon;
      GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      CREATE TABLE storage.objects (bucket_id text, name text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name, '/') $$;
      GRANT USAGE ON SCHEMA storage TO authenticated, anon;
      GRANT ALL ON storage.objects TO authenticated, anon;
    `);
    await db.exec(await readFile("cloudbase/001_initial.sql", "utf8"));
    const alice = {
      ...newJournal(),
      settings: { name: "Alice", waterGoal: 2000 },
    };
    await db.exec("SET ROLE authenticated; SET request.test_uid = 'alice';");
    const first = await db.query<{ revision: number }>(
      "SELECT * FROM public.save_journal($1::jsonb, 0)",
      [JSON.stringify(alice)],
    );
    expect(Number(first.rows[0].revision)).toBe(1);
    await expect(
      db.query("SELECT * FROM public.save_journal($1::jsonb, 0)", [
        JSON.stringify(alice),
      ]),
    ).rejects.toThrow("JOURNAL_CONFLICT");
    await db.query("SELECT * FROM public.save_journal($1::jsonb, 1)", [
      JSON.stringify(newJournal()),
    ]);
    expect(
      (await db.query("SELECT * FROM public.journal_versions")).rows,
    ).toHaveLength(2);
    await expect(db.exec("DELETE FROM public.journals")).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      db.exec("UPDATE public.journals SET revision = 99"),
    ).rejects.toThrow(/permission denied/);
    await db.exec(
      "INSERT INTO storage.objects VALUES ('meal-photos', 'alice/a.jpg');",
    );
    await expect(
      db.exec(
        "INSERT INTO storage.objects VALUES ('meal-photos', 'bob/b.jpg');",
      ),
    ).rejects.toThrow(/row-level security/);
    await db.exec("SET request.test_uid = 'bob';");
    expect((await db.query("SELECT * FROM public.journals")).rows).toHaveLength(
      0,
    );
    expect(
      (await db.query("SELECT * FROM public.journal_versions")).rows,
    ).toHaveLength(0);
    expect((await db.query("SELECT * FROM storage.objects")).rows).toHaveLength(
      0,
    );
    await db.exec("RESET ROLE; SET ROLE anon;");
    await expect(db.exec("SELECT * FROM public.journals")).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      db.query("SELECT * FROM public.save_journal($1::jsonb, 0)", [
        JSON.stringify(alice),
      ]),
    ).rejects.toThrow(/permission denied/);
  } finally {
    await db.close();
  }
});
