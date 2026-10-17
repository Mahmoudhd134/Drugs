import {type FormEvent, useEffect, useState} from "react";
import {type Location, Navigate, useLocation, useNavigate} from "react-router-dom";
import {Alert, Box, Button, Card, CardContent, Stack, TextField, Typography} from "@mui/material";
import {useTranslation} from "react-i18next";
import {getErrorMessage} from "../../../api/errors.ts";
import {requestOtp, useOtpMode, verifyOtp} from "../api.ts";
import {homeOf, useAuth} from "../useAuth.ts";
import type {Context} from "../types.ts";
import {FullPageSpinner} from "../../../components/common/FullPageSpinner.tsx";

/** Pages outside the clinic app, with what is below them (paths match without case, like the router's). */
const OUTSIDE_CLINIC_APP = ["/login", "/select-clinic", "/platform", "/admin"];

/**
 * Where a logged-in user goes from /login: the page they were sent here from (RequireAuth's `from`) when they are in a
 * clinic and it is inside the clinic app; else the context's home (also for a logged-in user opening /login, no `from`).
 */
const landingOf = (context: Context | null, from: Location | undefined) => {
    const pathname = from?.pathname.toLowerCase();
    const outsideClinicApp = !pathname || OUTSIDE_CLINIC_APP.some(p => pathname === p || pathname.startsWith(`${p}/`));
    return context?.type === "clinic" && from && !outsideClinicApp ? `${from.pathname}${from.search}` : homeOf(context);
};

/**
 * Phone → one-time code → in. In OTP display mode (development) the API returns the code: it is
 * shown, filled in and submitted automatically, under a visible banner.
 */
export const LoginPage = () => {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const {status, context, signIn} = useAuth();
    const {data: otpMode} = useOtpMode();

    const [step, setStep] = useState<"phone" | "code">("phone");
    const [phone, setPhone] = useState("");
    const [code, setCode] = useState("");
    const [devCode, setDevCode] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [resendAt, setResendAt] = useState(0);
    const [now, setNow] = useState(() => Date.now());

    // Ticks the resend countdown
    useEffect(() => {
        if (step !== "code" || resendAt <= now) return;
        const timer = window.setTimeout(() => setNow(Date.now()), 1000);
        return () => window.clearTimeout(timer);
    }, [step, resendAt, now]);

    if (status === "loading") return <FullPageSpinner/>;
    const from = (location.state as { from?: Location } | null)?.from;
    // Also renders right after this page's own login (signIn below), possibly before its navigate: both must go to the
    // same place, or the later one replaces the remembered page with the home
    if (status === "authenticated") return <Navigate to={landingOf(context, from)} replace/>;

    const verify = async (value: string) => {
        setBusy(true);
        setError(null);
        try {
            const auth = await verifyOtp(phone, value);
            signIn(auth);
            navigate(landingOf(auth.context, from), {replace: true});
        } catch (e) {
            setError(getErrorMessage(e));
            setBusy(false);
        }
    };

    const sendCode = async () => {
        setBusy(true);
        setError(null);
        try {
            const result = await requestOtp(phone);
            setStep("code");
            setResendAt(Date.now() + result.resendAfterSeconds * 1000);
            setNow(Date.now());
            setDevCode(result.devCode ?? null);
            setCode(result.devCode ?? "");
            if (result.devCode) {
                await verify(result.devCode);
                return;
            }
        } catch (e) {
            setError(getErrorMessage(e));
        }
        setBusy(false);
    };

    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (busy) return;
        if (step === "phone") void sendCode();
        else void verify(code);
    };

    const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));

    return (
        <Stack sx={{gap: 2}}>
            {(otpMode === "Display" || devCode) && <Alert severity="warning" variant="filled">{t("auth.displayModeBanner")}</Alert>}
            <Card variant="outlined">
                <CardContent component="form" onSubmit={onSubmit} noValidate sx={{p: {xs: 2.5, sm: 4}}}>
                    <Typography variant="h5" component="h1" gutterBottom>
                        {step === "phone" ? t("auth.loginTitle") : t("auth.codeTitle")}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{mb: 3}}>
                        {step === "phone"
                            ? t("auth.loginSubtitle")
                            : <>{t("auth.codeSentTo")} <Box component="span" dir="ltr" sx={{fontWeight: 600}}>{phone}</Box></>}
                    </Typography>

                    <Stack sx={{gap: 2}}>
                        {step === "phone" ? (
                            <TextField
                                label={t("auth.phone")}
                                helperText={t("auth.phoneHint")}
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                type="tel"
                                autoComplete="tel"
                                autoFocus
                                required
                                fullWidth
                                slotProps={{htmlInput: {dir: "ltr", inputMode: "tel", maxLength: 30}}}
                            />
                        ) : (
                            <>
                                {devCode && <Alert severity="info">{t("auth.devCode")} <b dir="ltr">{devCode}</b></Alert>}
                                <TextField
                                    label={t("auth.code")}
                                    value={code}
                                    onChange={(e) => setCode(e.target.value)}
                                    autoComplete="one-time-code"
                                    autoFocus
                                    required
                                    fullWidth
                                    slotProps={{htmlInput: {dir: "ltr", inputMode: "numeric", maxLength: 9}}}
                                />
                            </>
                        )}

                        {error && <Alert severity="error">{error}</Alert>}

                        <Button
                            type="submit"
                            variant="contained"
                            size="large"
                            disabled={busy || (step === "phone" ? !phone.trim() : !code.trim())}
                        >
                            {step === "phone"
                                ? busy ? t("auth.sending") : t("auth.sendCode")
                                : busy ? t("auth.verifying") : t("auth.verify")}
                        </Button>

                        {step === "code" && (
                            <Stack direction="row" sx={{justifyContent: "space-between", flexWrap: "wrap", gap: 1}}>
                                <Button
                                    onClick={() => {
                                        setStep("phone");
                                        setCode("");
                                        setDevCode(null);
                                        setError(null);
                                    }}
                                    disabled={busy}
                                >
                                    {t("auth.changePhone")}
                                </Button>
                                <Button onClick={() => void sendCode()} disabled={busy || secondsLeft > 0}>
                                    {secondsLeft > 0 ? t("auth.resendIn", {count: secondsLeft}) : t("auth.resend")}
                                </Button>
                            </Stack>
                        )}
                    </Stack>
                </CardContent>
            </Card>
        </Stack>
    );
};
