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
  ],
});
