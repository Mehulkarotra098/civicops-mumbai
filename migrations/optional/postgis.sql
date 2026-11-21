-- Optional: run on hosted PostgreSQL with PostGIS (Neon, Supabase, RDS) after the numbered migrations.
-- Not applied automatically and NOT verified in this build (no PostGIS was available locally).
-- Adds geometry columns and spatial indexes; the application's TypeScript geometry keeps working without it.
create extension if not exists postgis;
alter table wards add column if not exists geom geometry(Polygon, 4326);
update wards set geom = ST_SetSRID(ST_GeomFromGeoJSON(boundary_geojson::text), 4326) where boundary_geojson is not null;
create index if not exists wards_geom_idx on wards using gist (geom);
alter table roads add column if not exists geom geometry(LineString, 4326);
update roads set geom = ST_SetSRID(ST_GeomFromGeoJSON(geometry::text), 4326) where geometry is not null;
create index if not exists roads_geom_idx on roads using gist (geom);
alter table tickets add column if not exists geom geometry(Point, 4326)
  generated always as (case when lat is not null and lon is not null then ST_SetSRID(ST_MakePoint(lon, lat), 4326) end) stored;
create index if not exists tickets_geom_idx on tickets using gist (geom);
-- Example: ward for a point
-- select ward_code from wards where ST_Contains(geom, ST_SetSRID(ST_MakePoint(72.8466, 19.1279), 4326));
