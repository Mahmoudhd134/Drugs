import {renderWithProviders, type RenderWithProvidersOptions} from "../render.tsx";
import {AdminRoutes} from "./AdminRoutes.tsx";
import "./patience.ts";

export {navigateInApp} from "./appNavigation.ts";

/**
 * Renders the admin area (AdminRoutes) at `route` for the super admin in the platform context; `layout: true` adds
 * AdminLayout's frame (app bar, sidebar).
 */
export const renderAdmin = (route: string, options: Omit<RenderWithProvidersOptions, "route" | "path"> & { layout?: boolean } = {}) => {
    const {layout = false, ...rest} = options;
    return renderWithProviders(<AdminRoutes layout={layout}/>, {route, user: {context: "platform"}, ...rest});
};
