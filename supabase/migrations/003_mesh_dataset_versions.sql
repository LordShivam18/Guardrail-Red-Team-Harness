create table if not exists mesh_dataset_versions (
  id serial primary key,
  version varchar(20) not null,
  payload_count integer not null,
  export_hash varchar(64) not null,
  exported_at timestamptz default now(),
  changelog text
);
