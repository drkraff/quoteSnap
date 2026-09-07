import { createSingleFlight } from './single-flight';

describe('createSingleFlight', () => {
  it('does not run the task concurrently', async () => {
    const flight = createSingleFlight();
    let concurrent = 0;
    let maxConcurrent = 0;
    let runs = 0;

    const task = async (): Promise<void> => {
      runs += 1;
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await Promise.resolve();
      await Promise.resolve();
      concurrent -= 1;
    };

    await Promise.all([flight.run(task), flight.run(task), flight.run(task)]);

    expect(maxConcurrent).toBe(1);
    expect(runs).toBe(2);
  });

  it('coalesces overlapping callers into one rerun instead of N extra passes', async () => {
    const flight = createSingleFlight();
    const started: number[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const task = async (): Promise<void> => {
      started.push(Date.now());
      if (started.length === 1) {
        await gate;
      }
    };

    const first = flight.run(task);
    const second = flight.run(task);
    const third = flight.run(task);
    release();
    await Promise.all([first, second, third]);

    expect(started).toHaveLength(2);
  });

  it('runs sequential callers independently', async () => {
    const flight = createSingleFlight();
    let runs = 0;
    const task = async (): Promise<void> => {
      runs += 1;
    };

    await flight.run(task);
    await flight.run(task);

    expect(runs).toBe(2);
  });
});
