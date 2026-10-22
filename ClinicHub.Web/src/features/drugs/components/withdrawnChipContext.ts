import {createContext} from "react";

/**
 * True inside a control that is itself clickable and focusable (a picker's option): the «معطّل من الإدارة» chip there
 * is not a Tab stop of its own (a focusable element inside an option or a button is invalid ARIA); its tooltip still
 * opens on hover and tap, and its text stays the chip's accessible description.
 */
export const WithdrawnChipInsideControl = createContext(false);
