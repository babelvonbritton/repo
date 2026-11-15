import type { Msg } from "@/i18n/types";
import { AppError } from "@/lib/errors/AppError";
import type { ErrorCenter } from "@/lib/errors/ErrorCenter";
import type { Outcome, StepState } from "./types";

export interface StepOutcome {
  detail?: Msg;
  /** Marks the step as finished with notices. */
  warning?: boolean;
  /** Marks the step as skipped. */
  skipped?: boolean;
}

export interface StepDef<C> {
  id: string;
  titleKey: Msg["key"];
  run: (ctx: C) => Promise<StepOutcome | void>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs steps in order and reports each one's state. The first failure stops the run, is turned into an AppError,
 * logged, and attached to its step. Each step stays visible for at least `minStepMs` so progress is readable.
 */
export class StepRunner<C> {
  constructor(private readonly steps: StepDef<C>[], private readonly errors: ErrorCenter, private readonly minStepMs = 260) {}

  async run(ctx: C, onChange: (steps: StepState[]) => void, action: string): Promise<Outcome<null>> {
    const states: StepState[] = this.steps.map((s) => ({ id: s.id, titleKey: s.titleKey, status: "pending" }));
    const publish = () => onChange(states.map((s) => ({ ...s })));
    publish();

    for (let i = 0; i < this.steps.length; i++) {
      const step = this.steps[i];
      states[i].status = "running";
      publish();
      const started = Date.now();
      try {
        const outcome = (await step.run(ctx)) ?? {};
        const wait = this.minStepMs - (Date.now() - started);
        if (wait > 0) await sleep(wait);
        states[i].status = outcome.skipped ? "skipped" : outcome.warning ? "warning" : "done";
        states[i].detail = outcome.detail;
        publish();
      } catch (e) {
        const error = this.errors.report(AppError.from(e), { action: `${action}.${step.id}`, surface: "inline" });
        states[i].status = "error";
        states[i].error = error;
        publish();
        return { ok: false, error };
      }
    }
    return { ok: true, value: null };
  }
}
