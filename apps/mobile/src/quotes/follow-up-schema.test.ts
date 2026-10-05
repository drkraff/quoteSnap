import { schema } from '../db/schema';
import { migrations } from '../db/migrations';

describe('follow-up schema', () => {
  it('stores the snooze on quotes at schema version 12', () => {
    expect(schema.version).toBe(12);
    const columns = schema.tables['quotes']?.columns;
    expect(columns?.['followed_up_at']).toMatchObject({
      name: 'followed_up_at',
      type: 'number',
      isOptional: true,
    });
    expect(columns?.['follow_up_dismissed']).toMatchObject({
      name: 'follow_up_dismissed',
      type: 'boolean',
      isOptional: true,
    });
  });

  it('migrates an existing v9 database forward without a new table', () => {
    expect(migrations.maxVersion).toBe(12);
    const step = migrations.sortedMigrations.find((migration) => migration.toVersion === 10);
    expect(step?.steps).toHaveLength(1);
    expect(step?.steps[0]).toMatchObject({
      type: 'add_columns',
      table: 'quotes',
    });
  });
});
