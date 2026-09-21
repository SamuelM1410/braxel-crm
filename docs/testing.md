# Testing safely

Integration tests intentionally mutate and restore rows. They must use a
throwaway PostgreSQL database whose name ends with `_test`.

1. Start a local PostgreSQL server or create a separate remote test database.
2. Copy `.env.test.example` to `.env.test` and set `TEST_DATABASE_URL`.
3. Run `bun run db:test` once to create the database and apply migrations.
4. Run `bun run --filter=agent test`.

The test client refuses `DATABASE_URL` and refuses database names that do not
end in `_test`; this prevents accidental writes to production.
