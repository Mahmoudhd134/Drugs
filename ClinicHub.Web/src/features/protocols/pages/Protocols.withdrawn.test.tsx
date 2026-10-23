import {describe, expect, test, vi} from "vitest";
import {screen, waitFor, within} from "@testing-library/react";
import {aDrug, aProtocol, anItem, aSharedDrug, protocolsHandlers, renderWithProviders, server, setViewportWidth} from "../../../test";
import type {Protocol} from "../types.ts";
import {ProtocolsPage} from "./ProtocolsPage.tsx";
import {ProtocolPicker} from "../components/ProtocolPicker.tsx";
import {expectWithdrawnTooltip, WITHDRAWN, withdrawnMark} from "../../../test/pages/withdrawn.ts";

// A protocol's card with a withdrawn line (design M1.7 D6; M1.7b contract "Protocol cards"): «الأدوية: N» counts every
// line, plus `<WithdrawnChip count={n}/>` «معطّل من الإدارة: n» when n > 0, with its tooltip; on the protocols page and
// in the prescription's Protocols tab (ProtocolPicker).

const threeLines = (name = "Post cataract") => aProtocol({
    name,
    items: [
        anItem(aDrug({name: "Tobradex"})),
        anItem(aSharedDrug({name: "VIGAMOX 0.5% EYE DROPS 5 ML", withdrawn: true})),
        anItem(aSharedDrug({name: "XALATAN 50MCG/ML EYE DROPS 2.5 ML"})),
    ],
});

const cardOf = async (name: string) =>
    (await screen.findByText(name, {exact: true})).closest(".MuiCard-root, [role=option]") as HTMLElement;

const openPage = (protocols: Protocol[], lang: "ar" | "en" = "ar") => {
    server.use(...protocolsHandlers(protocols));
    return renderWithProviders(<ProtocolsPage/>, {lang, route: "/protocols"});
};

const openPicker = (protocols: Protocol[], lang: "ar" | "en" = "ar") => {
    server.use(...protocolsHandlers(protocols));
    return renderWithProviders(<ProtocolPicker onSelect={vi.fn()}/>, {lang});
};

describe("protocol cards with a disabled drug @area:catalog", () => {
    test("protocols page: 3 lines, 1 disabled: «الأدوية: 3» and «معطّل من الإدارة: 1» with its tooltip on hover and focus @CAT-157", async () => {
        await openPage([threeLines()]);
        const card = await cardOf("Post cataract");
        expect(card).toHaveTextContent("الأدوية: 3");
        await expectWithdrawnTooltip(withdrawnMark(card, WITHDRAWN.ar.count(1)));
    });

    test("the prescription's Protocols tab shows the same count and mark @CAT-157", async () => {
        await openPicker([threeLines()]);
        const option = await cardOf("Post cataract");
        expect(option).toHaveTextContent("الأدوية: 3");
        // Inside the option (a control): no Tab stop of its own, its tooltip on hover (contract D17)
        await expectWithdrawnTooltip(withdrawnMark(option, WITHDRAWN.ar.count(1)), "ar", true);
    });

    // T3 W4 (design M1.7 D6 "on tap … closes on a tap elsewhere"; decision D17 "its tooltip opens on hover and tap"): on a
    // phone, a tap on the chip inside the prescription's protocol option shows its tooltip and does not add the protocol;
    // a tap elsewhere on the option still adds it
    test("on a 375 px phone a tap on the «معطّل من الإدارة: 1» chip shows its tooltip and does not add the protocol @CAT-167", async () => {
        setViewportWidth(375);
        server.use(...protocolsHandlers([threeLines()]));
        const onSelect = vi.fn();
        const {user} = await renderWithProviders(<ProtocolPicker onSelect={onSelect}/>, {lang: "ar"});
        const option = await cardOf("Post cataract");
        const chip = withdrawnMark(option, WITHDRAWN.ar.count(1));
        await user.pointer([{keys: "[TouchA]", target: chip}]);
        await waitFor(() => expect(screen.getByRole("tooltip")).toHaveTextContent(WITHDRAWN.ar.tooltip));
        expect(onSelect).not.toHaveBeenCalled();

        await user.pointer([{keys: "[TouchA]", target: within(option).getByText("Post cataract", {exact: true})}]);
        await waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1));
    });

    test("in English: \"Drugs: 3\" and \"Disabled by admin: 1\" with the English tooltip @CAT-157", async () => {
        await openPage([threeLines()], "en");
        const card = await cardOf("Post cataract");
        expect(card).toHaveTextContent("Drugs: 3");
        await expectWithdrawnTooltip(withdrawnMark(card, WITHDRAWN.en.count(1)), "en");
    });

    test("a protocol with no disabled line has no mark @CAT-157", async () => {
        await openPage([aProtocol({name: "Dry eye", items: [anItem(aDrug()), anItem(aSharedDrug())]}), threeLines()]);
        const card = await cardOf("Dry eye");
        expect(card).toHaveTextContent("الأدوية: 2");
        expect(card).not.toHaveTextContent(WITHDRAWN.ar.chip);
        await cardOf("Post cataract");
        expect(screen.getAllByText(WITHDRAWN.ar.count(1))).toHaveLength(1);
    });
});

describe("protocol cards: no «مشترك» chip @area:catalog", () => {
    test.each([["ar", "مشترك"], ["en", "Shared"]] as const)("(%s) a card with shared drugs shows no «%s» chip, on the protocols page and in the picker @CAT-278",
        async (lang, chip) => {
            const {unmount} = await openPage([threeLines()], lang);
            await cardOf("Post cataract");
            expect(screen.queryByText(chip)).not.toBeInTheDocument();
            unmount();
            await openPicker([threeLines()], lang);
            await cardOf("Post cataract");
            expect(screen.queryByText(chip)).not.toBeInTheDocument();
        });
});
