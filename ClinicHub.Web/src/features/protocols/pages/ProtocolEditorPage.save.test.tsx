import {describe, expect, test} from "vitest";
import {act, screen, waitFor, within} from "@testing-library/react";
import type {UserEvent} from "@testing-library/user-event";
import {http, HttpResponse} from "msw";
import {useNavigate} from "react-router-dom";
import {
    aDrug,
    aProtocol,
    anItem,
    api,
    createTestQueryClient,
    protocolsHandlers,
    drugsHandlers,
    findToast,
    isRed,
    problem,
    recordRequests,
    renderWithProviders,
    server,
} from "../../../test";
import {protocolKeys} from "../api.ts";
import type {Protocol} from "../types.ts";
import {ProtocolEditorPage} from "./ProtocolEditorPage.tsx";
import {
    discardDialog,
    layoutSortableRows,
    lineDetails,
    lineRows,
    lineSummary,
    openEditor,
} from "../../../test/pages/protocolEditor.tsx";

// The protocol editor's save, load and leave: docs/features/protocols/business.md ("القواعد", "الرسائل", "تعديل أو
// حذف بروتوكول") and tech.md "Frontend" (client checks, eye clash, unsaved-changes guard), docs/tech/overview.md
// "App shell" and "Data fetching" (errors.<code>, else errors.generic).

const nameField = () => screen.getByRole("textbox", {name: "اسم البروتوكول"});
const saveButton = () => screen.getByRole("button", {name: "حفظ"});
const twoDrugProtocol = () => aProtocol({name: "Post cataract", items: [anItem(aDrug({name: "Tobradex"})), anItem(aDrug({name: "Vigamox"}))]});

/** Moves line `from` (1-based) by `steps` places with dnd-kit's keyboard sensor (Space, arrows, Space). */
const moveLine = async (user: UserEvent, from: number, steps: number) => {
    const handle = screen.getAllByRole("button", {name: "اسحب لتغيير الترتيب"})[from - 1];
    handle.focus();
    await user.keyboard(" ");
    await user.keyboard(steps > 0 ? "{ArrowDown>" + steps + "/}" : "{ArrowUp>" + -steps + "/}");
    await user.keyboard(" ");
    await waitFor(() => expect(screen.queryByRole("button", {pressed: true})).not.toBeInTheDocument());
};

describe("protocol editor: opening @area:catalog", () => {
    test("new protocol: title «بروتوكول جديد», the focus in the name, «لا توجد أدوية في هذا البروتوكول» @GRP-047", async () => {
        await openEditor();
        expect(screen.getByRole("heading", {level: 1, name: "بروتوكول جديد"})).toBeInTheDocument();
        expect(nameField()).toHaveFocus();
        expect(nameField()).toHaveValue("");
        expect(screen.getByText("لا توجد أدوية في هذا البروتوكول")).toBeInTheDocument();
    });

    test("in English: \"New protocol\" and \"No drugs in this protocol\" @GRP-047", async () => {
        await openEditor({lang: "en"});
        expect(screen.getByRole("heading", {level: 1, name: "New protocol"})).toBeInTheDocument();
        expect(screen.getByText("No drugs in this protocol")).toBeInTheDocument();
    });

    test("an existing protocol: title «تعديل البروتوكول», the name and lines pre-filled @GRP-059", async () => {
        await openEditor({protocol: twoDrugProtocol()});
        expect(screen.getByRole("heading", {level: 1, name: "تعديل البروتوكول"})).toBeInTheDocument();
        expect(nameField()).toHaveValue("Post cataract");
        expect(lineSummary()).toEqual([["1", "Tobradex"], ["2", "Vigamox"]]);
    });

    test("in English the title reads \"Edit protocol\" @GRP-059", async () => {
        await openEditor({protocol: twoDrugProtocol(), lang: "en"});
        expect(screen.getByRole("heading", {level: 1, name: "Edit protocol"})).toBeInTheDocument();
    });

    test("`/protocols/abc` and `/protocols/1.5` redirect to `/protocols` @GRP-060", async () => {
        for (const route of ["/protocols/abc", "/protocols/1.5"]) {
            const recorded = recordRequests();
            const {location, unmount} = await renderWithProviders(<ProtocolEditorPage/>, {route, path: "/protocols/:id"});
            await waitFor(() => expect(location().pathname).toBe("/protocols"));
            expect(recorded.requests).toEqual([]);
            recorded.stop();
            unmount();
        }
    });
});

describe("protocol editor: always the protocol as it is now @area:catalog", () => {
    // The protocol as the app cached it earlier, and as the API answers now (its drug renamed and given a new description
    // on the drugs page meanwhile)
    const protocolNowAndBefore = () => {
        const now = aProtocol({name: "Post cataract", items: [anItem(aDrug({name: "Tobradex ST", description: "New note"}))]});
        const before: Protocol = {...now, items: [anItem({...now.items[0].drug, name: "Tobradex", description: "Old note"})]};
        return {now, before};
    };

    /** GET /protocols/:id answering `protocol` only once `release()` is called; `requests()` counts the GETs. */
    const heldProtocolAnswer = (protocol: Protocol) => {
        let release = () => {};
        const held = new Promise<void>(resolve => (release = resolve));
        let count = 0;
        server.use(
            ...drugsHandlers(protocol.items.map(i => i.drug)),
            http.get(api("/protocols/:id"), async () => {
                count++;
                await held;
                return HttpResponse.json(protocol);
            }),
        );
        return {release, requests: () => count};
    };

    /** Opens `/protocols/{id}` with `before` already in the cache (opened earlier in the session). */
    const openWithCached = async (before: Protocol) => {
        const queryClient = createTestQueryClient();
        queryClient.setQueryData(protocolKeys.detail(before.id), before);
        return renderWithProviders(<ProtocolEditorPage/>, {lang: "ar", route: `/protocols/${before.id}`, path: "/protocols/:id", queryClient});
    };

    test("a protocol cached from before: the loading shows until the protocol is fetched again, then the form shows the fresh lines, never the cached ones @GRP-099 @DRUG-071", async () => {
        const {now, before} = protocolNowAndBefore();
        const answer = heldProtocolAnswer(now);
        await openWithCached(before);

        await waitFor(() => expect(answer.requests()).toBe(1));
        expect(screen.getByRole("progressbar")).toBeInTheDocument();
        expect(screen.queryByRole("textbox", {name: "اسم البروتوكول"})).not.toBeInTheDocument();
        expect(screen.queryByText("Tobradex")).not.toBeInTheDocument();
        expect(screen.queryByText("Old note")).not.toBeInTheDocument();

        answer.release();
        expect(await screen.findByText("Tobradex ST")).toBeInTheDocument();
        expect(nameField()).toHaveValue("Post cataract");
        expect(lineSummary()).toEqual([["1", "Tobradex ST"]]);
        expect(lineDetails(lineRows()[0])).toContain("New note");
        expect(screen.queryByText("Old note")).not.toBeInTheDocument();
        expect(answer.requests()).toBe(1);
    });

    test("a protocol cached from before whose fetch fails: the error with «إعادة المحاولة» instead of the cached form @GRP-099", async () => {
        const {before} = protocolNowAndBefore();
        server.use(http.get(api("/protocols/:id"), () => problem(404, "notFound")));
        await openWithCached(before);

        expect(await screen.findByText("هذا العنصر لم يعد موجودًا.")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "إعادة المحاولة"})).toBeInTheDocument();
        expect(screen.queryByRole("textbox", {name: "اسم البروتوكول"})).not.toBeInTheDocument();
        expect(screen.queryByText("Tobradex")).not.toBeInTheDocument();
    });

    test("the protocol fetched again while the editor is open (e.g. after a save elsewhere): the form and its changes stay @GRP-099", async () => {
        const {now} = protocolNowAndBefore();
        const {user, queryClient} = await openEditor({protocol: now});
        await user.type(nameField(), " 2");
        const changed = {...now, name: "Renamed elsewhere", items: []};
        server.use(...protocolsHandlers([changed]));

        await act(() => queryClient.refetchQueries({queryKey: protocolKeys.detail(now.id)}));
        expect(queryClient.getQueryData(protocolKeys.detail(now.id))).toEqual(changed);
        expect(nameField()).toHaveValue("Post cataract 2");
        expect(lineSummary()).toEqual([["1", "Tobradex ST"]]);
        // The baseline stays the protocol as opened: undoing the change leaves without asking
        await user.clear(nameField());
        await user.type(nameField(), "Post cataract");
        await user.click(screen.getByRole("button", {name: "رجوع"}));
        expect(discardDialog()).not.toBeInTheDocument();
    });

    test("the same page going from protocol A to B and back to A before B answers: A waits for a fresh answer, its earlier copy is not shown @GRP-099", async () => {
        const drug = aDrug({name: "Tobradex"});
        const a = aProtocol({name: "Protocol A", items: [anItem(drug)]});
        const b = aProtocol({name: "Protocol B", items: [anItem(drug)]});
        const answers = new Map<number, Protocol>([[a.id, a], [b.id, b]]);
        let gate = Promise.resolve();
        let release = () => {};
        server.use(
            ...drugsHandlers([drug]),
            http.get(api("/protocols/:id"), async ({params}) => {
                await gate;
                return HttpResponse.json(answers.get(Number(params.id)));
            }),
        );
        // Links outside the page: the route param changes, the page stays mounted
        const GoTo = () => {
            const navigate = useNavigate();
            return [a, b].map(g => <button key={g.id} onClick={() => navigate(`/protocols/${g.id}`)}>{`go ${g.name}`}</button>);
        };
        const {user} = await renderWithProviders(<><GoTo/><ProtocolEditorPage/></>, {lang: "ar", route: `/protocols/${a.id}`, path: "/protocols/:id"});
        await waitFor(() => expect(nameField()).toHaveValue("Protocol A"));

        gate = new Promise<void>(resolve => (release = resolve));
        await user.click(screen.getByRole("button", {name: "go Protocol B"}));
        await waitFor(() => expect(screen.queryByRole("textbox", {name: "اسم البروتوكول"})).not.toBeInTheDocument());
        answers.set(a.id, {...a, name: "Protocol A renamed"});
        await user.click(screen.getByRole("button", {name: "go Protocol A"}));
        expect(screen.getByRole("progressbar")).toBeInTheDocument();
        expect(screen.queryByRole("textbox", {name: "اسم البروتوكول"})).not.toBeInTheDocument();

        release();
        await waitFor(() => expect(nameField()).toHaveValue("Protocol A renamed"));
    });
});

describe("protocol editor: checks before saving @area:catalog", () => {
    test("an empty or spaces-only name: «الاسم مطلوب.» on the name, no request @GRP-049", async () => {
        const recorded = recordRequests();
        const {user} = await openEditor({drugs: [aDrug({name: "Tobradex"})]});
        await user.click(await screen.findByText("Tobradex"));
        await user.click(saveButton());
        expect(isRed(nameField())).toBe(true);
        expect(nameField()).toHaveAccessibleDescription("الاسم مطلوب.");
        await user.type(nameField(), "   ");
        await user.click(saveButton());
        expect(nameField()).toHaveAccessibleDescription("الاسم مطلوب.");
        expect(recorded.writes()).toEqual([]);
    });

    test("in English the empty name reads \"Name is required.\" @GRP-049", async () => {
        const {user} = await openEditor({lang: "en"});
        await user.click(screen.getByRole("button", {name: "Save"}));
        expect(screen.getByRole("textbox", {name: "Protocol name"})).toHaveAccessibleDescription("Name is required.");
    });

    test("a name and no drugs: the error toast «أضف دواءً واحدًا على الأقل.», no request @GRP-050", async () => {
        const recorded = recordRequests();
        const {user} = await openEditor();
        await user.type(nameField(), "Post cataract");
        await user.click(saveButton());
        expect(await findToast()).toBe("أضف دواءً واحدًا على الأقل.");
        expect(recorded.writes()).toEqual([]);
    });

    test("in English: \"Add at least one drug.\" @GRP-050", async () => {
        const {user} = await openEditor({lang: "en"});
        await user.type(screen.getByRole("textbox", {name: "Protocol name"}), "Post cataract");
        await user.click(screen.getByRole("button", {name: "Save"}));
        expect(await findToast()).toBe("Add at least one drug.");
    });
});

describe("protocol editor: API refusals @area:catalog", () => {
    test("`duplicateProtocolItem` from the API: «يوجد دواء مكرر في البروتوكول لنفس العين.» @GRP-035", async () => {
        const protocol = twoDrugProtocol();
        const {user} = await openEditor({protocol});
        server.use(http.put(api("/protocols/:id"), () => problem(400, "duplicateProtocolItem", {errors: [{code: "duplicateProtocolItem", field: "items"}]})));
        await user.click(saveButton());
        expect(await findToast()).toBe("يوجد دواء مكرر في البروتوكول لنفس العين.");
        expect(nameField()).toBeInTheDocument();
    });

    test("in English: \"A drug is in the protocol twice for the same eye.\" @GRP-035", async () => {
        const {user} = await openEditor({protocol: twoDrugProtocol(), lang: "en"});
        server.use(http.put(api("/protocols/:id"), () => problem(400, "duplicateProtocolItem", {errors: [{code: "duplicateProtocolItem", field: "items"}]})));
        await user.click(screen.getByRole("button", {name: "Save"}));
        expect(await findToast()).toBe("A drug is in the protocol twice for the same eye.");
    });
});

describe("protocol editor: the protocol deleted meanwhile @area:catalog", () => {
    test.each([
        ["ar", "هذا العنصر لم يعد موجودًا.", "حفظ"],
        ["en", "This item no longer exists.", "Save"],
    ] as const)("deleted in another window (%s), Save: the toast %s @GRP-063", async (lang, message, save) => {
        const {user} = await openEditor({protocol: twoDrugProtocol(), lang});
        server.use(http.put(api("/protocols/:id"), () => problem(404, "notFound")));
        await user.click(screen.getByRole("button", {name: save}));
        expect(await findToast()).toBe(message);
    });
});

describe("protocol editor: two lines of a drug for the same eye @area:catalog", () => {
    // Saved when the drug's default eye was left; it is right now, so both lines give the right eye
    const clashProtocol = (): Protocol => {
        const drug = aDrug({name: "Tobradex", defaultDosing: {doseUnit: "drop", eye: "right"}});
        return aProtocol({items: [anItem(drug), anItem(drug, {eye: "right", frequency: "daily", frequencyValue: 2}), anItem(aDrug({name: "Vigamox"}))]});
    };
    const clashText = "يوجد دواء مكرر في البروتوكول لنفس العين (مُعلَّم بالأسفل). احذف أحد السطرين أو غيّر العين، ثم احفظ.";

    test("Save shows the clash text as an error toast and sends nothing; after removing a line the marks go and it saves @GRP-085", async () => {
        const recorded = recordRequests();
        const {user, location} = await openEditor({protocol: clashProtocol()});
        const marked = () => lineRows().filter(row => within(row).queryByText("نفس الدواء والعين في سطر آخر"));
        expect(marked()).toHaveLength(2);
        expect(screen.getByRole("alert")).toHaveTextContent(clashText);

        await user.click(saveButton());
        expect(await findToast()).toBe(clashText);
        expect(recorded.writes()).toEqual([]);

        await user.click(within(lineRows()[1]).getByRole("button", {name: "إزالة"}));
        expect(marked()).toHaveLength(0);
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        await user.click(saveButton());
        // The success toast first: it leaves after 2 s, which a busy machine can spend waiting for the navigation
        expect(await findToast()).toBe("تم تحديث البروتوكول");
        await waitFor(() => expect(location().pathname).toBe("/protocols"));
        expect(recorded.writes()).toHaveLength(1);
    });

    test("in English: \"Same drug and eye as another line\" and the clash text on Save @GRP-085", async () => {
        const {user} = await openEditor({protocol: clashProtocol(), lang: "en"});
        const text = "A drug is in the protocol twice for the same eye (marked below). Remove a line or change its eye, then save.";
        expect(screen.getAllByText("Same drug and eye as another line")).toHaveLength(2);
        expect(screen.getByRole("alert")).toHaveTextContent(text);
        await user.click(screen.getByRole("button", {name: "Save"}));
        expect(await findToast()).toBe(text);
    });

    test("without `protocols.update` the chips show but not the alert @GRP-086", async () => {
        await openEditor({protocol: clashProtocol(), permissions: ["protocols.list", "protocols.details", "drugs.list"]});
        expect(screen.getByRole("heading", {level: 1, name: "البروتوكول"})).toBeInTheDocument();
        expect(screen.getAllByText("نفس الدواء والعين في سطر آخر")).toHaveLength(2);
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(screen.queryByText(clashText)).not.toBeInTheDocument();
    });
});

describe("protocol editor: the unsaved-changes guard @area:catalog", () => {
    const back = (user: UserEvent) => user.click(screen.getByRole("button", {name: "رجوع"}));

    test("no changes: «رجوع» leaves without asking @GRP-090", async () => {
        const {user, location} = await openEditor({protocol: twoDrugProtocol()});
        await back(user);
        await waitFor(() => expect(location().pathname).toBe("/protocols"));
        expect(discardDialog()).not.toBeInTheDocument();
    });

    test("in English the question reads \"Discard changes?\" / \"Your unsaved changes to this protocol will be lost.\" @GRP-092", async () => {
        const {user} = await openEditor({protocol: twoDrugProtocol(), lang: "en"});
        await user.type(screen.getByRole("textbox", {name: "Protocol name"}), " 2");
        await user.click(screen.getByRole("button", {name: "Back"}));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByRole("heading", {name: "Discard changes?"})).toBeInTheDocument();
        expect(dialog).toHaveTextContent("Your unsaved changes to this protocol will be lost.");
        expect(within(dialog).getByRole("button", {name: "Discard"})).toBeInTheDocument();
    });

    const undone: [string, (user: UserEvent) => Promise<void>][] = [
        ["name edited back", async user => {
            await user.type(nameField(), "x");
            await user.type(nameField(), "{Backspace}");
        }],
        ["name with trailing spaces", user => user.type(nameField(), "   ")],
        ["override set then reset", async user => {
            for (const button of ["اليسرى", "استخدام جرعة الدواء الافتراضية"]) {
                await user.click(within(lineRows()[0]).getByRole("button", {name: "تعديل الجرعة"}));
                const dialog = within(await screen.findByRole("dialog"));
                await user.click(dialog.getByRole("button", {name: button}));
                await user.click(dialog.getByRole("button", {name: "حفظ"}));
                await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
            }
            expect(within(lineRows()[0]).queryByText("جرعة خاصة بالبروتوكول")).not.toBeInTheDocument();
        }],
        ["line moved away and back", async user => {
            await moveLine(user, 1, 1);
            expect(lineSummary()).toEqual([["1", "Vigamox"], ["2", "Tobradex"]]);
            await moveLine(user, 2, -1);
            expect(lineSummary()).toEqual([["1", "Tobradex"], ["2", "Vigamox"]]);
        }],
    ];
    test.each(undone)("a change undone by hand (%s): «رجوع» leaves without asking @GRP-091", async (_, undo) => {
        layoutSortableRows();
        const {user, location} = await openEditor({protocol: twoDrugProtocol()});
        await undo(user);
        await back(user);
        await waitFor(() => expect(location().pathname).toBe("/protocols"));
        expect(discardDialog()).not.toBeInTheDocument();
    });

    const changes: [string, (user: UserEvent) => Promise<void>][] = [
        ["name", user => user.type(nameField(), " 2")],
        ["add", async user => user.click(await screen.findByText("Pred Forte"))],
        ["remove", user => user.click(within(lineRows()[1]).getByRole("button", {name: "إزالة"}))],
        ["reorder", async user => {
            await moveLine(user, 2, -1);
            expect(lineSummary()).toEqual([["1", "Vigamox"], ["2", "Tobradex"]]);
        }],
        ["override", async user => {
            await user.click(within(lineRows()[0]).getByRole("button", {name: "تعديل الجرعة"}));
            const dialog = within(await screen.findByRole("dialog"));
            await user.click(dialog.getByRole("button", {name: "اليمنى"}));
            await user.click(dialog.getByRole("button", {name: "حفظ"}));
            await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
        }],
    ];
    test.each(changes)("a change of the %s alone asks «تجاهل التغييرات؟» on «رجوع» @GRP-092", async (kind, change) => {
        layoutSortableRows();
        const protocol = twoDrugProtocol();
        const {user, location} = await openEditor({protocol, drugs: [...protocol.items.map(i => i.drug), aDrug({name: "Pred Forte"})]});
        await change(user);
        await back(user);
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByRole("heading", {name: "تجاهل التغييرات؟"}), kind).toBeInTheDocument();
        expect(dialog).toHaveTextContent("ستفقد التغييرات غير المحفوظة على هذا البروتوكول.");
        expect(within(dialog).getByRole("button", {name: "تجاهل"})).toBeInTheDocument();
        await user.click(within(dialog).getByRole("button", {name: "إلغاء"}));
        await waitFor(() => expect(discardDialog()).not.toBeInTheDocument());
        expect(location().pathname, kind).toBe(`/protocols/${protocol.id}`);
    });
});
