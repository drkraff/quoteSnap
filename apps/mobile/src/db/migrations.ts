import { schemaMigrations, addColumns } from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: 'quotes',
          columns: [
            { name: 'voice_job_id', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 3,
      steps: [
        addColumns({
          table: 'quotes',
          columns: [
            { name: 'is_archived', type: 'boolean', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 4,
      steps: [
        addColumns({
          table: 'quotes',
          columns: [
            { name: 'private_note', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
  ],
});
