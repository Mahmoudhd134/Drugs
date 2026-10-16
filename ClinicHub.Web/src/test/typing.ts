import type {UserEvent} from "@testing-library/user-event";

/**
 * Replaces an input's text with `text` in one paste (one input event, as typing it would end): much faster than
 * typing it key by key, for tests where the keystrokes themselves don't matter. Respects `maxlength`.
 */
export const fillIn = async (user: UserEvent, input: HTMLElement, text: string) => {
    await user.clear(input);
    if (text) await user.paste(text);
};
