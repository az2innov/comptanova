import { runMigrations } from "./database.js";

const result = runMigrations();
console.log(
  JSON.stringify(
    {
      status: "OK",
      appliedVersions: result.appliedVersions,
      totalMigrations: result.totalMigrations,
    },
    null,
    2
  )
);
