import {useId} from "react";
import {Box, Checkbox, FormControl, FormControlLabel, FormGroup, FormLabel, Stack, Typography} from "@mui/material";
import {useTranslation} from "react-i18next";
import type {PermissionDefinition} from "../../access/api.ts";
import {groupCatalog, requiredBy, toggle} from "../permissionChoice.ts";
import {usePermissionLabels} from "../usePermissionLabels.ts";

type Props = {
    catalog: PermissionDefinition[];
    /** The ticked keys (always with their requirements) */
    value: ReadonlySet<string>;
    onChange: (keys: string[]) => void;
    disabled?: boolean;
};

/**
 * The permissions of a role, grouped by module then resource. Ticking one ticks what it requires; a requirement of a
 * ticked permission is locked, with a hint naming the permissions that need it. A locked box stays focusable
 * (`aria-disabled`, not `disabled`), so keyboard and screen reader users reach it and hear the hint.
 */
export const PermissionPicker = ({catalog, value, onChange, disabled}: Props) => {
    const {t} = useTranslation();
    const labels = usePermissionLabels();
    const hintIdPrefix = useId();

    return (
        <Stack sx={{gap: 2.5}}>
            {groupCatalog(catalog).map(({module, resources}) => (
                <Box key={module} component="section" aria-label={labels.module(module)}>
                    <Typography variant="subtitle2" component="h3" sx={{fontWeight: 700, mb: 1}}>{labels.module(module)}</Typography>
                    <Box sx={{display: "grid", gridTemplateColumns: {xs: "1fr", sm: "1fr 1fr"}, gap: 2}}>
                        {resources.map(({resource, permissions}) => (
                            <FormControl
                                key={resource}
                                component="fieldset"
                                variant="outlined"
                                disabled={disabled}
                                // A module of one resource: the module's title says it, no legend repeats it
                                aria-label={resources.length === 1 ? labels.resource(resource) : undefined}
                                sx={{border: 1, borderColor: "divider", borderRadius: 1, px: 1.5, pb: 1, pt: resources.length === 1 ? 0.5 : 0, m: 0, minWidth: 0}}
                            >
                                {resources.length > 1 && (
                                    <FormLabel component="legend" sx={{px: 0.5, typography: "body2", fontWeight: 600}}>
                                        {labels.resource(resource)}
                                    </FormLabel>
                                )}
                                <FormGroup>
                                    {permissions.map(permission => {
                                        const neededBy = value.has(permission.key) ? requiredBy(catalog, value, permission.key) : [];
                                        const locked = neededBy.length > 0;
                                        const hintId = `${hintIdPrefix}-${permission.key}`;
                                        return (
                                            <FormControlLabel
                                                key={permission.key}
                                                control={
                                                    <Checkbox
                                                        checked={value.has(permission.key)}
                                                        onChange={() => {
                                                            if (!locked) onChange(toggle(catalog, value, permission.key));
                                                        }}
                                                        disabled={disabled}
                                                        slotProps={{
                                                            input: {
                                                                "aria-disabled": locked || undefined,
                                                                "aria-describedby": locked ? hintId : undefined,
                                                            },
                                                        }}
                                                        // Locked: ticked in grey (still 3:1), not the colour of a choice
                                                        sx={locked ? {"&.Mui-checked": {color: "text.secondary"}} : undefined}
                                                    />
                                                }
                                                // The hint is the box's description (said after its name), not part of the name
                                                label={
                                                    <Box sx={{py: 0.75}}>
                                                        <Typography variant="body2">{labels.permission(permission.key)}</Typography>
                                                        {locked && (
                                                            <Typography id={hintId} aria-hidden variant="caption" color="text.secondary" sx={{display: "block"}}>
                                                                {t("roles.editor.requiredBy", {
                                                                    names: neededBy.map(p => labels.permission(p.key)).join(t("common.listSeparator")),
                                                                })}
                                                            </Typography>
                                                        )}
                                                    </Box>
                                                }
                                                sx={{
                                                    alignItems: "flex-start",
                                                    mr: 0,
                                                    "& .MuiCheckbox-root": {pt: 0.5},
                                                }}
                                            />
                                        );
                                    })}
                                </FormGroup>
                            </FormControl>
                        ))}
                    </Box>
                </Box>
            ))}
        </Stack>
    );
};
