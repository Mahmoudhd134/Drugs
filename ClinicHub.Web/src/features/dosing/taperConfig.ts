import type {DurationUnit, Frequency} from "./types.ts";

// Tapering schedule options, in one place so the clinic's choices are one-line changes.
// The limits are mirrored in ClinicHub.Domain/Catalog/DosingRules.cs: keep both in sync.

/** Most steps a schedule can have */
export const MAX_TAPER_STEPS = 10;

/** Frequencies a step can use */
export const TAPER_STEP_FREQUENCIES: Frequency[] = ["daily", "everyHours"];

/** Periods a step can use */
export const TAPER_STEP_DURATIONS: DurationUnit[] = ["days", "weeks"];

/** The last step may also be open-ended */
export const TAPER_LAST_STEP_DURATIONS: DurationUnit[] = [...TAPER_STEP_DURATIONS, "continuous", "untilNextVisit"];

/** End the sentence with «ثم يتوقف» when the last step has a fixed duration */
export const SAY_STOP_AFTER_LAST_STEP = true;

/** Let each step (after the first) have its own dose, in the line's unit */
export const ALLOW_STEP_DOSE = true;

/** Show the "Generate steps" helper (start, reduce by, every, down to) */
export const ENABLE_TAPER_GENERATOR = true;

/** Used when a schedule is started from an empty dosing */
export const TAPER_DEFAULT_TIMES_PER_DAY = 4;
