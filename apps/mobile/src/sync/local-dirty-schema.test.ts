import { schema } from '../db/schema';
import { migrations } from '../db/migrations';

describe('local dirty schema', () => {
  it('stores the dirty-field token map on quotes at schema version 12', () => {
    expect(schema.version).toBe(12);
    const columns = schema.tables['quotes']?.columns;
    expect(columns?.['local_dirty']).toMatchObject({
      name: 'local_dirty',
      type: 'string',
      isOptional: true,
    });
    expect(columns?.['server_revision']).toBeDefined();
    expect(columns?.['followed_up_at']).toBeDefined();
    expect(columns?.['follow_up_dismissed']).toBeDefined();
  });

  it('migrates an existing v11 database by adding the column', () => {
    expect(migrations.maxVersion).toBe(12);
    const step = migrations.sortedMigrations.find((migration) => migration.toVersion === 12);
    expect(step?.steps).toHaveLength(1);
    expect(step?.steps[0]).toMatchObject({
      type: 'add_columns',
      table: 'quotes',
      columns: [
        {
          name: 'local_dirty',
          type: 'string',
          isOptional: true,
        },
      ],
    });
  });
});
