import { runMigrations } from "../src/db/migrate";
import { seedPermissionsIfNeeded } from "../src/db/seed";

runMigrations();
seedPermissionsIfNeeded();