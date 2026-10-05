export type BootSteps = {
  assertBootEnv: () => void;
  warnOptional: () => void;
  initBoss: () => Promise<void>;
  listen: () => void;
  installShutdown: () => void;
};

export async function runBootSteps(steps: BootSteps): Promise<void> {
  steps.assertBootEnv();
  steps.warnOptional();
  await steps.initBoss();
  steps.listen();
  steps.installShutdown();
}

/** A throw before listen exits non-zero and does not leave the process serving. */
export async function runBootOrExit(
  steps: BootSteps,
  report: { exit: (code: number) => void; logError: (err: unknown) => void },
): Promise<void> {
  try {
    await runBootSteps(steps);
  } catch (err) {
    report.logError(err);
    report.exit(1);
  }
}
