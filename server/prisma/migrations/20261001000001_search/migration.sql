-- Fuzzy (trigram) and full-text search support for the library and the roulette library.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "LibraryEntry_searchText_trgm_idx" ON "LibraryEntry" USING GIN ("searchText" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "LibraryEntry_searchText_fts_idx" ON "LibraryEntry" USING GIN (to_tsvector('simple', "searchText"));
CREATE INDEX IF NOT EXISTS "LibraryEntry_name_trgm_idx" ON "LibraryEntry" USING GIN (lower("name") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Roller_searchText_trgm_idx" ON "Roller" USING GIN ("searchText" gin_trgm_ops);
