import { schemaMigrations, addColumns, createTable } from '@nozbe/watermelondb/Schema/migrations';

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
    {
      toVersion: 5,
      steps: [
        addColumns({
          table: 'quotes',
          columns: [
            { name: 'client_sentence', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 6,
      steps: [
        createTable({
          name: 'resume_checkpoints',
          columns: [
            { name: 'contractor_id', type: 'string', isIndexed: true },
            { name: 'kind', type: 'string' },
            { name: 'quote_id', type: 'string', isOptional: true },
            { name: 'audio_uri', type: 'string', isOptional: true },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 7,
      steps: [
        addColumns({
          table: 'quotes',
          columns: [
            { name: 'rooms_json', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 8,
      steps: [
        addColumns({
          table: 'quotes',
          columns: [
            { name: 'photos_json', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
  ],
});
