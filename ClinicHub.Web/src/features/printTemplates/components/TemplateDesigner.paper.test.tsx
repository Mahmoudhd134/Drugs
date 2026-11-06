import {describe, expect, test, vi} from "vitest";
import {act, fireEvent, screen, waitFor, within} from "@testing-library/react";
import type {UserEvent} from "@testing-library/user-event";
import {delay, http, HttpResponse} from "msw";
import {api as client} from "../../../api/client.ts";
import {
    aClinicDetails,
    adminClinicsHandlers,
    aPaperImage,
    aPrintLayout,
    aPrintTemplate,
    aTemplateItem,
    expectToasts,
    paperImageHandlers,
    printTemplateHandlers,
    problem,
    recordRequests,
    server,
    setViewportWidth,
    toastTexts,
} from "../../../test";
import type {RecordedRequest} from "../../../test";
import {aFile, findRefusal, named, REASON, refusedLine, selectedRows, stubObjectUrls} from "../../../test/pages/attachments.tsx";
import {
    calibrationField,
    deleteButton,
    designerShown,
    FIELD_LABEL,
    label,
    noLeaveQuestion,
    paperImage,
    paperLoadFailed,
    paperOpacitySlider,
    paperPath,
    paperRow,
    paperRowButton,
    paperRulesLine,
    paperSection,
    paperSectionShown,
    paperShowSwitch,
    paperUploadButton,
    paperUrl,
    pickPaper,
    renderDesigner,
    renderDesignerWithoutPaper,
    renderPrintTemplateTab,
    saveButton,
    selectedIds,
    settingsField,
    sheetItem,
    tabPath,
    testPrintButton,
    typeInField,
    undoButton,
    unloadAsks,
} from "../../../test/pages/printTemplate.tsx";
import {installPrint} from "../../../test/print.ts";
import type {Attachment} from "../../attachments/types.ts";

// The paper image: step 4 design § 3 and its table, P1, P6–P8; contract §§ 4.5, 5. Stretching, the zoom and real files: e2e. An upload shows only `stored()`'s row: jsdom can't carry a file's name.

const layoutL = (fields = {}) => aPrintLayout({
    items: [aTemplateItem("prescriptionText", {id: "t"}), aTemplateItem("manualInput", {id: "m"}), aTemplateItem("function", {id: "f"})],
    ...fields,
});

const aPng = (name = "scan.png") => aFile(name, 2048, "image/png");
const overviewTab = () => screen.getByRole("tab", {name: "Overview"});

/** The URL the picture shows now, or null. */
const shownUrl = () => paperImage()?.getAttribute("src") ?? null;
const pictureShown = () => waitFor(() => {
    const url = shownUrl();
    if (!url) throw new Error("no picture on the sheet");
    return url;
});

/** The tab with these stored pictures, the newest's picture on the sheet. */
const openWithPicture = async (files: Attachment[] = [aPaperImage()], options: Parameters<typeof renderDesigner>[1] = {}) => {
    const urls = stubObjectUrls();
    const rendered = await renderDesigner(layoutL(), {paperImages: files, ...options});
    const firstUrl = await pictureShown();
    return {...rendered, urls, firstUrl};
};

/** Picks `file` and waits for Upload to be on (off while the list loads or reloads, part 2), then presses it. */
const uploadFile = async (user: UserEvent, file: File) => {
    await paperSectionShown();
    pickPaper(file);
    await waitFor(() => expect(paperUploadButton()).toBeEnabled());
    await user.click(paperUploadButton());
};

const removeAnswering = async (user: UserEvent, name: string, answer: "common.delete" | "common.cancel") => {
    await user.click(paperRowButton(name, "deleteFile")!);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", {name: label(answer)}));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
};

const fileReads = (requests: RecordedRequest[], clinicId: number, id: string) =>
    requests.filter(request => request.method === "GET" && request.path === `${paperPath(clinicId)}/${id}`);
const listReads = (requests: RecordedRequest[], clinicId: number) =>
    requests.filter(request => request.method === "GET" && request.path === paperPath(clinicId));

const pressKey = (key: string) => fireEvent.keyDown(paperOpacitySlider()!, {key});

describe("no paper adapter @area:admin", () => {
    test("no picture section and no request for it @TPL-644", async () => {
        const recorded = recordRequests();
        const {clinic} = await renderDesignerWithoutPaper(layoutL());

        expect(paperSection()).toBeNull();
        expect(paperImage()).toBeNull();
        expect(paperRulesLine()).toBeNull();
        expect(recorded.requests.filter(request => request.path.startsWith(paperPath(clinic.id)))).toEqual([]);
    });
});

describe("a clinic with no picture @area:admin", () => {
    test.each([
        ["en", "PNG / JPEG, up to 10 MB. One image per clinic.", "No files yet."],
        ["ar", "PNG / JPEG، حتى 10 ميجابايت، صورة واحدة لكل عيادة.", "لا توجد ملفات بعد."],
    ] as const)("in %s: the rules line, the picker, no «no files» line, no switch, slider or picture @TPL-670", async (lang, rules, noFiles) => {
        const recorded = recordRequests();
        const clinic = aClinicDetails();
        await renderDesigner(layoutL(), {lang, clinic});
        const section = await paperSectionShown();

        expect(paperRulesLine()).toHaveTextContent(rules);
        expect(screen.getByTestId("attachment-input")).toBeInTheDocument();
        expect(within(section).queryByText(noFiles)).not.toBeInTheDocument();
        expect(paperShowSwitch()).toBeNull();
        expect(paperOpacitySlider()).toBeNull();
        expect(paperImage()).toBeNull();
        await waitFor(() => expect(listReads(recorded.requests, clinic.id)).toHaveLength(1));
    });

    test("with a picture the rules line stays @TPL-670", async () => {
        await openWithPicture();
        expect(paperRulesLine()).toHaveTextContent("PNG / JPEG, up to 10 MB. One image per clinic.");
    });
});

describe("uploading @area:admin", () => {
    test("a JPEG: POSTed, its row listed, the picture from its bytes on the sheet, at 50% @TPL-651", async () => {
        const urls = stubObjectUrls();
        const clinic = aClinicDetails();
        const stored = aPaperImage({originalFileName: "scan.jpg", typeKey: "jpeg", contentType: "image/jpeg"});
        const {user} = await renderDesigner(layoutL(), {clinic, paperStored: () => stored});
        const recorded = recordRequests();

        await uploadFile(user, aFile("scan.jpg", 2048, "image/jpeg"));

        await waitFor(() => expect(paperRow("scan.jpg")).not.toBeNull());
        const url = await pictureShown();
        expect(recorded.writes().map(write => `${write.method} ${write.path}`)).toEqual([`POST ${paperPath(clinic.id)}`]);
        expect(await urls.created[Number(url.split("/").pop()) - 1].text()).toBe("content of scan.jpg");
        expect(paperImage()!.style.opacity).toBe("0.5");
        expect(paperOpacitySlider()).toHaveAttribute("aria-valuetext", "50%");
        expect(paperShowSwitch()).toBeChecked();
    });

    test.each([
        ["a PDF", "en", "scan.pdf", "application/pdf", REASON.typeNotAllowed],
        ["a WebP", "en", "scan.webp", "image/webp", REASON.typeNotAllowed],
        ["a PDF, in Arabic", "ar", "scan.pdf", "application/pdf", "نوع هذا الملف غير مسموح به."],
    ] as const)("%s picked: refused here with the translated message, nothing sent, the old picture stays @TPL-652", async (_name, lang, fileName, type, reason) => {
        const {firstUrl} = await openWithPicture([aPaperImage()], {lang});
        const recorded = recordRequests();
        await paperSectionShown();

        pickPaper(aFile(fileName, 100, type));

        if (lang === "en") await findRefusal(refusedLine(fileName, reason));
        else await waitFor(() => expect(paperSection()).toHaveTextContent(reason));
        expect(selectedRows(label("attachments.selectedLabel"))).toHaveLength(0);
        expect(recorded.writes()).toEqual([]);
        expect(shownUrl()).toBe(firstUrl);
    });

    test("a PNG named .jpg, refused by the server: the file stays selected with the reason and Retry, the old picture stays @TPL-652", async () => {
        const clinic = aClinicDetails();
        const stored = aPaperImage();
        const refused = () => problem(400, "attachmentTypeNotAllowed");
        const {user, firstUrl, paperImages} = await openWithPicture([stored], {clinic});
        server.use(http.post(paperUrl(clinic.id), refused), http.put(`${paperUrl(clinic.id)}/:id`, refused));

        await uploadFile(user, aFile("scan.jpg", 2048, "image/jpeg"));

        await waitFor(() => expect(paperSection()).toHaveTextContent(REASON.typeNotAllowed));
        expect(screen.getByRole("button", {name: named.retry("scan.jpg")})).toBeInTheDocument();
        expect(paperRow(stored.originalFileName)).not.toBeNull();
        expect(paperImages).toEqual([stored]);
        expect(shownUrl()).toBe(firstUrl);
    });

    test("a new pick shows beside the row and replaces it only when Upload is pressed @TPL-725", async () => {
        const clinic = aClinicDetails();
        const old = aPaperImage({originalFileName: "old.png"});
        const next = aPaperImage({originalFileName: "new.png"});
        const {user, firstUrl} = await openWithPicture([old], {clinic, paperStored: () => next});
        const recorded = recordRequests();
        await paperSectionShown();

        pickPaper(aPng("picked.png"));
        await waitFor(() => expect(selectedRows(label("attachments.selectedLabel"))).toHaveLength(1));
        await waitFor(() => expect(paperUploadButton()).toBeEnabled());

        expect(paperRow("old.png")).not.toBeNull();
        expect(shownUrl()).toBe(firstUrl);
        expect(recorded.writes()).toEqual([]);

        await user.click(paperUploadButton());

        await waitFor(() => expect(paperRow("new.png")).not.toBeNull());
        expect(paperRow("old.png")).toBeNull();
        expect(recorded.writes().map(write => `${write.method} ${write.path}`)).toEqual([`PUT ${paperPath(clinic.id)}/${old.id}`]);
        await waitFor(() => expect(shownUrl()).not.toBe(firstUrl));
    });
});

describe("the stored picture's row @area:admin", () => {
    test("Preview, Download and Remove; no Replace icon and no «Download all» @TPL-725", async () => {
        const stored = aPaperImage({originalFileName: "scan.png"});
        await openWithPicture([stored]);

        expect(paperRowButton("scan.png", "previewFile")).toBeInTheDocument();
        expect(paperRowButton("scan.png", "downloadFile")).toBeInTheDocument();
        expect(paperRowButton("scan.png", "deleteFile")).toBeInTheDocument();
        expect(paperRowButton("scan.png", "replaceFile")).toBeNull();
        expect(screen.queryByRole("button", {name: label("attachments.downloadAll")})).not.toBeInTheDocument();
    });

    test("Remove, Cancel: the picture stays, nothing sent @TPL-655", async () => {
        const stored = aPaperImage({originalFileName: "scan.png"});
        const {user, firstUrl, paperImages} = await openWithPicture([stored]);
        const recorded = recordRequests();

        await removeAnswering(user, "scan.png", "common.cancel");

        expect(paperRow("scan.png")).not.toBeNull();
        expect(shownUrl()).toBe(firstUrl);
        expect(paperImages).toEqual([stored]);
        expect(recorded.writes()).toEqual([]);
    });

    test("Remove and its confirm: DELETE, gone at once with its switch and slider, the picker and the rules stay @TPL-655", async () => {
        const clinic = aClinicDetails();
        const stored = aPaperImage({originalFileName: "scan.png"});
        const {user, paperImages} = await openWithPicture([stored], {clinic});
        const recorded = recordRequests();

        await removeAnswering(user, "scan.png", "common.delete");

        await waitFor(() => expect(paperImage()).toBeNull());
        await waitFor(() => expect(paperRow("scan.png")).toBeNull());
        expect(recorded.writes().map(write => `${write.method} ${write.path}`)).toEqual([`DELETE ${paperPath(clinic.id)}/${stored.id}`]);
        expect(paperImages).toEqual([]);
        expect(paperShowSwitch()).toBeNull();
        expect(paperOpacitySlider()).toBeNull();
        expect(paperRulesLine()).toBeInTheDocument();
        expect(screen.getByTestId("attachment-input")).toBeInTheDocument();
    });
});

describe("the picture and the layout's changes @area:admin", () => {
    const editM = async (user: UserEvent) => {
        await user.click(sheetItem("الاسم"));
        await typeInField(user, settingsField(FIELD_LABEL.x), "20");
        await user.tab();
    };

    test("an upload with the layout unsaved: the change stays, Save stays on; undo takes the change back and leaves the picture @TPL-656", async () => {
        stubObjectUrls();
        const stored = aPaperImage({originalFileName: "scan.png"});
        const {user} = await renderDesigner(layoutL(), {paperStored: () => stored});
        await editM(user);

        await uploadFile(user, aPng());
        await waitFor(() => expect(paperRow("scan.png")).not.toBeNull());
        await pictureShown();

        expect(settingsField(FIELD_LABEL.x)).toHaveValue("20");
        expect(saveButton()).toBeEnabled();

        await user.click(undoButton());

        expect(settingsField(FIELD_LABEL.x)).not.toHaveValue("20");
        expect(saveButton()).toBeDisabled();
        expect(undoButton()).toBeDisabled();
        expect(paperRow("scan.png")).not.toBeNull();
        expect(shownUrl()).not.toBeNull();
    });

    test("a removal with the layout unsaved: the change stays, Save stays on; undo doesn't bring the picture back @TPL-656", async () => {
        const stored = aPaperImage({originalFileName: "scan.png"});
        const {user} = await openWithPicture([stored]);
        await editM(user);

        await removeAnswering(user, "scan.png", "common.delete");
        await waitFor(() => expect(paperImage()).toBeNull());

        expect(settingsField(FIELD_LABEL.x)).toHaveValue("20");
        expect(saveButton()).toBeEnabled();

        await user.click(undoButton());

        expect(settingsField(FIELD_LABEL.x)).not.toHaveValue("20");
        expect(paperImage()).toBeNull();
        expect(paperRow("scan.png")).toBeNull();
    });

    test("only an upload: Save stays off, nothing to undo, leaving asks nothing @TPL-657", async () => {
        stubObjectUrls();
        const clinic = aClinicDetails();
        const {user, location} = await renderDesigner(layoutL(), {clinic});

        await uploadFile(user, aPng());
        await pictureShown();

        expect(saveButton()).toBeDisabled();
        expect(undoButton()).toBeDisabled();
        expect(unloadAsks()).toBe(false);
        await user.click(overviewTab());
        noLeaveQuestion();
        await waitFor(() => expect(location().pathname).toBe(`/admin/clinics/${clinic.id}`));
    });

    test("only a removal: Save stays off, nothing to undo, leaving asks nothing @TPL-657", async () => {
        const stored = aPaperImage({originalFileName: "scan.png"});
        const {user} = await openWithPicture([stored]);

        await removeAnswering(user, "scan.png", "common.delete");
        await waitFor(() => expect(paperImage()).toBeNull());

        expect(saveButton()).toBeDisabled();
        expect(undoButton()).toBeDisabled();
        expect(unloadAsks()).toBe(false);
    });
});

describe("show or hide, and the opacity @area:admin", () => {
    test("the switch off: the picture is hidden with no new request; on: the same picture @TPL-658", async () => {
        const clinic = aClinicDetails();
        const stored = aPaperImage();
        const recorded = recordRequests();
        const {user, firstUrl, urls} = await openWithPicture([stored], {clinic});
        const created = urls.created.length;

        expect(paperShowSwitch()).toBeChecked();
        await user.click(paperShowSwitch()!);
        expect(paperImage()).toBeNull();
        expect(paperShowSwitch()).not.toBeChecked();

        await user.click(paperShowSwitch()!);
        expect(shownUrl()).toBe(firstUrl);
        expect(fileReads(recorded.requests, clinic.id, stored.id)).toHaveLength(1);
        expect(urls.created).toHaveLength(created);
    });

    test("opacity changed and hidden, the page reopened: 50% and shown @TPL-659", async () => {
        const clinic = aClinicDetails();
        const {user, router} = await openWithPicture([aPaperImage()], {clinic});

        pressKey("ArrowUp");
        expect(paperImage()!.style.opacity).toBe("0.6");
        await user.click(paperShowSwitch()!);
        expect(paperImage()).toBeNull();

        await act(() => router!.navigate(`/admin/clinics/${clinic.id}`));
        await waitFor(() => expect(paperSection()).toBeNull());
        await act(() => router!.navigate(tabPath(clinic.id)));
        await designerShown();
        await pictureShown();

        expect(paperImage()!.style.opacity).toBe("0.5");
        expect(paperOpacitySlider()).toHaveAttribute("aria-valuetext", "50%");
        expect(paperShowSwitch()).toBeChecked();
    });

    test.each([
        ["en", "ArrowRight", "ArrowLeft"],
        ["ar", "ArrowLeft", "ArrowRight"],
    ] as const)("in %s, the slider has a name, its keys step 10 within 10 to 100, and more is more opaque @TPL-660", async (lang, more, less) => {
        await openWithPicture([aPaperImage()], {lang});
        expect(paperOpacitySlider()).toHaveAttribute("aria-valuetext", "50%");

        pressKey("ArrowUp");
        expect(paperOpacitySlider()).toHaveAttribute("aria-valuetext", "60%");
        expect(paperImage()!.style.opacity).toBe("0.6");

        pressKey(more);
        expect(paperOpacitySlider()).toHaveAttribute("aria-valuetext", "70%");
        expect(paperImage()!.style.opacity).toBe("0.7");

        pressKey(less);
        pressKey("ArrowDown");
        expect(paperOpacitySlider()).toHaveAttribute("aria-valuetext", "50%");
        expect(paperImage()!.style.opacity).toBe("0.5");

        for (let presses = 0; presses < 7; presses++) pressKey("ArrowUp");
        expect(paperOpacitySlider()).toHaveAttribute("aria-valuetext", "100%");
        expect(paperImage()!.style.opacity).toBe("1");

        for (let presses = 0; presses < 12; presses++) pressKey("ArrowDown");
        expect(paperOpacitySlider()).toHaveAttribute("aria-valuetext", "10%");
        expect(paperImage()!.style.opacity).toBe("0.1");
    });
});

describe("a picture that won't load @area:admin", () => {
    /** A read of this file answered as the flag says, from the first request on. */
    const readThatFails = (clinicId: number, id: string) => {
        const state = {broken: true};
        return {
            state,
            handler: http.get(`${paperUrl(clinicId)}/${id}`, () => (state.broken
                ? problem(500, "unexpected")
                : new HttpResponse("recovered", {headers: {"Content-Type": "image/png"}}))),
        };
    };

    const retryButton = () => within(paperLoadFailed()!).getByRole("button", {name: label("common.retry")});

    test("a failed read: the message with Retry on a blank sheet; the sheet works and Test print prints; Retry shows it after recovery, and reloads the list @TPL-665", async () => {
        const printing = installPrint();
        const urls = stubObjectUrls();
        const clinic = aClinicDetails();
        const stored = aPaperImage();
        const read = readThatFails(clinic.id, stored.id);
        const recorded = recordRequests();
        const {user} = await renderDesigner(layoutL(), {clinic, paperImages: [stored], handlers: [read.handler]});

        await waitFor(() => expect(paperLoadFailed()).toHaveTextContent("Couldn't show the paper image."));
        expect(paperImage()).toBeNull();

        await user.click(sheetItem("الاسم"));
        expect(selectedIds()).toEqual(["m"]);
        await user.click(testPrintButton());
        await waitFor(() => expect(printing.print).toHaveBeenCalledTimes(1));

        read.state.broken = false;
        const listsBefore = listReads(recorded.requests, clinic.id).length;
        await user.click(retryButton());

        const url = await pictureShown();
        expect(paperLoadFailed()).toBeNull();
        expect(await urls.created[Number(url.split("/").pop()) - 1].text()).toBe("recovered");
        await waitFor(() => expect(listReads(recorded.requests, clinic.id).length).toBeGreaterThan(listsBefore));
    });

    test("an `error` event on the picture: its URL revoked, the message with Retry, the sheet works; Retry reads the bytes again @TPL-665", async () => {
        const clinic = aClinicDetails();
        const stored = aPaperImage();
        const recorded = recordRequests();
        const {user, firstUrl, urls} = await openWithPicture([stored], {clinic});

        fireEvent.error(paperImage()!);

        await waitFor(() => expect(paperLoadFailed()).toHaveTextContent("Couldn't show the paper image."));
        expect(paperImage()).toBeNull();
        expect(urls.revoked).toContain(firstUrl);
        expect(toastTexts()).toEqual([]);
        await user.click(sheetItem("الاسم"));
        expect(selectedIds()).toEqual(["m"]);

        await user.click(retryButton());

        const again = await pictureShown();
        expect(again).not.toBe(firstUrl);
        expect(paperLoadFailed()).toBeNull();
        expect(fileReads(recorded.requests, clinic.id, stored.id)).toHaveLength(2);
    });
});

describe("the template deleted @area:admin", () => {
    test("the empty state has no picture section; the row stays, and a new template shows the picture with no correction @TPL-672", async () => {
        const clinic = aClinicDetails();
        const stored = aPaperImage();
        const {user, paperImages} = await openWithPicture([stored], {
            clinic,
            template: aPrintTemplate({layout: layoutL({calibration: {xMm: 5, yMm: 5}})}),
        });
        const recorded = recordRequests();

        await user.click(deleteButton());
        const dialog = await screen.findByRole("dialog", {name: label("printTemplates.deleteConfirm")});
        await user.click(within(dialog).getByRole("button", {name: label("common.delete")}));

        const create = await screen.findByRole("button", {name: label("printTemplates.create")});
        expect(paperSection()).toBeNull();
        expect(paperImage()).toBeNull();
        expect(paperImages).toEqual([stored]);
        expect(recorded.writes().filter(write => write.path.startsWith(paperPath(clinic.id)))).toEqual([]);

        await user.click(create);
        await designerShown();
        await pictureShown();
        expect(calibrationField("x")).toHaveValue("0");
        expect(calibrationField("y")).toHaveValue("0");
        expect(paperRow(stored.originalFileName)).not.toBeNull();
    });
});

describe("leaving a picture behind @area:admin", () => {
    /** Clinic B's routes and rows, its file answered only when the test says. */
    const clinicB = (template = aPrintTemplate({layout: layoutL()})) => {
        const clinic = aClinicDetails({name: "Clinic B"});
        const stored = aPaperImage({originalFileName: "b.png"});
        let release = () => undefined as void;
        const held = new Promise<void>(resolve => (release = resolve));
        return {
            clinic,
            stored,
            release: () => release(),
            handlers: [
                http.get(`${paperUrl(clinic.id)}/${stored.id}`, async () => {
                    await held;
                    return new HttpResponse("content of b.png", {headers: {"Content-Type": "image/png"}});
                }),
                ...printTemplateHandlers(clinic.id, {template}),
                ...paperImageHandlers(clinic.id, [stored]),
            ],
        };
    };

    test("switching to clinic B: A's picture never shows under B and its URL is revoked; B's shows when it's read @TPL-674", async () => {
        const a = aClinicDetails({name: "Clinic A"});
        const b = clinicB();
        const {router, firstUrl, urls} = await openWithPicture([aPaperImage({originalFileName: "a.png"})], {clinic: a, template: aPrintTemplate({layout: layoutL()})});
        server.use(...adminClinicsHandlers([a, b.clinic]), ...b.handlers);

        await act(() => router!.navigate(tabPath(b.clinic.id)));
        await paperSectionShown();
        await waitFor(() => expect(paperRow("b.png")).not.toBeNull());

        expect(paperRow("a.png")).toBeNull();
        expect(paperImage(), "A's picture never under B").toBeNull();
        expect(urls.revoked).toContain(firstUrl);
        expect(urls.live()).not.toContain(firstUrl);

        b.release();
        const url = await pictureShown();
        expect(url).not.toBe(firstUrl);
        expect(await urls.created[Number(url.split("/").pop()) - 1].text()).toBe("content of b.png");
    });

    test("an upload in flight when switching to clinic B aborts, and nothing of it shows under B @TPL-674", async () => {
        stubObjectUrls();
        const a = aClinicDetails({name: "Clinic A"});
        const b = clinicB();
        const {user, router} = await renderPrintTemplateTab({
            clinic: a,
            template: aPrintTemplate({layout: layoutL()}),
            handlers: [http.post(paperUrl(a.id), async () => {
                await delay("infinite");
                return new HttpResponse(null, {status: 500});
            })],
        });
        await designerShown();
        const post = vi.spyOn(client, "post");
        server.use(...adminClinicsHandlers([a, b.clinic]), ...b.handlers);

        await uploadFile(user, aPng());
        await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
        const signal = post.mock.calls[0][2]?.signal as AbortSignal;
        expect(signal.aborted).toBe(false);

        await act(() => router!.navigate(tabPath(b.clinic.id)));
        await paperSectionShown();

        await waitFor(() => expect(signal.aborted).toBe(true));
        expect(selectedRows(label("attachments.selectedLabel"))).toHaveLength(0);
        expect(toastTexts()).toEqual([]);
        b.release();
    });

    test("the URL is revoked on a replace and on a removal too @TPL-674", async () => {
        const old = aPaperImage({originalFileName: "old.png"});
        const next = aPaperImage({originalFileName: "new.png"});
        const {user, firstUrl, urls} = await openWithPicture([old], {paperStored: () => next});

        await uploadFile(user, aPng());
        await waitFor(() => expect(paperRow("new.png")).not.toBeNull());
        await waitFor(() => expect(urls.revoked).toContain(firstUrl));
        await waitFor(() => expect(shownUrl()).not.toBeNull());
        const secondUrl = shownUrl()!;
        expect(secondUrl).not.toBe(firstUrl);

        await removeAnswering(user, "new.png", "common.delete");
        await waitFor(() => expect(urls.revoked).toContain(secondUrl));
        expect(urls.live()).not.toContain(secondUrl);
    });

    test("leaving the page revokes the URL @TPL-674", async () => {
        const clinic = aClinicDetails();
        const {router, firstUrl, urls} = await openWithPicture([aPaperImage()], {clinic});

        await act(() => router!.navigate(`/admin/clinics/${clinic.id}`));

        await waitFor(() => expect(urls.revoked).toContain(firstUrl));
    });
});

describe("a picture removed in another window @area:admin", () => {
    test("Remove here: the 404 says so and reloads the list, the picture leaves @TPL-675", async () => {
        const stored = aPaperImage({originalFileName: "scan.png"});
        const {user, paperImages} = await openWithPicture([stored]);
        paperImages.splice(0);

        await removeAnswering(user, "scan.png", "common.delete");

        await expectToasts("This item no longer exists.");
        await waitFor(() => expect(paperRow("scan.png")).toBeNull());
        await waitFor(() => expect(paperImage()).toBeNull());
    });

    test("Upload here: a PUT's 404 with Retry on the file; Retry POSTs and adds a new picture @TPL-675", async () => {
        const clinic = aClinicDetails();
        const stale = aPaperImage({originalFileName: "scan.png"});
        const next = aPaperImage({originalFileName: "again.png"});
        const {user, paperImages} = await openWithPicture([stale], {clinic, paperStored: () => next});
        const recorded = recordRequests();
        paperImages.splice(0);

        await uploadFile(user, aPng());

        const retry = await screen.findByRole("button", {name: named.retry("scan.png")});
        await waitFor(() => expect(paperRow("scan.png")).toBeNull());
        await waitFor(() => expect(retry).toBeEnabled());
        await user.click(retry);

        await waitFor(() => expect(paperRow("again.png")).not.toBeNull());
        await pictureShown();
        expect(recorded.writes().map(write => `${write.method} ${write.path}`)).toEqual([
            `PUT ${paperPath(clinic.id)}/${stale.id}`,
            `POST ${paperPath(clinic.id)}`,
        ]);
    });
});

describe("two live rows from a race @area:admin", () => {
    test("the screen shows the newest; removing it brings the older back @TPL-676", async () => {
        const newer = aPaperImage({originalFileName: "newer.png", createdAt: "2026-11-06T11:00:00Z"});
        const older = aPaperImage({originalFileName: "older.png", createdAt: "2026-11-06T10:00:00Z"});
        const {user, firstUrl, urls} = await openWithPicture([newer, older]);

        expect(await urls.created[Number(firstUrl.split("/").pop()) - 1].text()).toBe("content of newer.png");

        await removeAnswering(user, "newer.png", "common.delete");

        await waitFor(() => expect(paperRow("newer.png")).toBeNull());
        await waitFor(() => expect(shownUrl()).not.toBeNull());
        const url = shownUrl()!;
        expect(url).not.toBe(firstUrl);
        expect(await urls.created[Number(url.split("/").pop()) - 1].text()).toBe("content of older.png");
        expect(urls.revoked).toContain(firstUrl);
    });
});

describe("the window below 900 px @area:admin", () => {
    const desktopOnly = "Open this page on a computer.";

    test("the message shows, the URL is revoked; widening keeps the draft and shows the picture again at 50% @TPL-677", async () => {
        const clinic = aClinicDetails();
        const stored = aPaperImage();
        const recorded = recordRequests();
        const {user, firstUrl, urls} = await openWithPicture([stored], {clinic});
        await typeInField(user, calibrationField("x"), "7");
        await user.tab();
        pressKey("ArrowUp");
        expect(paperImage()!.style.opacity).toBe("0.6");

        act(() => setViewportWidth(899));

        expect(await screen.findByText(desktopOnly)).toBeInTheDocument();
        expect(paperSection()).toBeNull();
        expect(paperImage()).toBeNull();
        await waitFor(() => expect(urls.revoked).toContain(firstUrl));

        act(() => setViewportWidth(900));

        await designerShown();
        const again = await pictureShown();
        expect(again).not.toBe(firstUrl);
        expect(paperImage()!.style.opacity).toBe("0.5");
        expect(paperOpacitySlider()).toHaveAttribute("aria-valuetext", "50%");
        expect(calibrationField("x")).toHaveValue("7");
        expect(saveButton()).toBeEnabled();
        expect(fileReads(recorded.requests, clinic.id, stored.id)).toHaveLength(2);
    });

    test("an upload in flight aborts, and nothing of it is left @TPL-677", async () => {
        stubObjectUrls();
        const clinic = aClinicDetails();
        const {user, paperImages} = await renderDesigner(layoutL(), {
            clinic,
            handlers: [http.post(paperUrl(clinic.id), async () => {
                await delay("infinite");
                return new HttpResponse(null, {status: 500});
            })],
        });
        const post = vi.spyOn(client, "post");

        await uploadFile(user, aPng());
        await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
        const signal = post.mock.calls[0][2]?.signal as AbortSignal;

        act(() => setViewportWidth(899));

        expect(await screen.findByText(desktopOnly)).toBeInTheDocument();
        await waitFor(() => expect(signal.aborted).toBe(true));

        act(() => setViewportWidth(1000));
        await designerShown();
        await paperSectionShown();
        expect(selectedRows(label("attachments.selectedLabel"))).toHaveLength(0);
        expect(paperImages).toEqual([]);
    });
});
