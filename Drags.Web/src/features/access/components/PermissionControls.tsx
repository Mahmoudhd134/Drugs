import type {ComponentPropsWithRef} from "react";
import {Button, Fab, IconButton, MenuItem} from "@mui/material";
import {withPermission} from "../withPermission.tsx";

// Ready-made gated MUI controls: gating a control is changing its name, e.g.
// <PermissionButton permission={PERMISSIONS.drugs.create} whenDenied="disable" …>
export const PermissionButton = withPermission<ComponentPropsWithRef<typeof Button>>(Button);
export const PermissionIconButton = withPermission<ComponentPropsWithRef<typeof IconButton>>(IconButton);
export const PermissionMenuItem = withPermission<ComponentPropsWithRef<typeof MenuItem>>(MenuItem);
export const PermissionFab = withPermission<ComponentPropsWithRef<typeof Fab>>(Fab);
