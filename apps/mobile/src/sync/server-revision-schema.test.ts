import { schema } from '../db/schema';
import { migrations } from '../db/migrations';

describe('server revision schema', () => {
  it('stores the last observed server updatedAt on quotes at schema version 11', () => {
    expect(schema.version).toBe(11);
    const columns = schema.tables['quotes']?.columns;
    expect(columns?.['server_revision']).toMatchObject({
      name: 'server_revision',
      type: 'string',
      isOptional: true,
    });
    expect(columns?.['followed_up_at']).toBeDefined();
    expect(columns?.['follow_up_dismissed']).toBeDefined();
  });

  it('migrates an existing v10 database by adding the column', () => {
    expect(migrations.maxVersion).toBe(11);
    const step = migrations.sortedMigrations.find((migration) => migration.toVersion === 11);
    expect(step?.steps).toHaveLength(1);
    expect(step?.steps[0]).toMatchObject({
      type: 'add_columns',
      table: 'quotes',
      columns: [
        {
          name: 'server_revision',
          type: 'string',
          isOptional: true,
        },
      ],
    });
  });
});
