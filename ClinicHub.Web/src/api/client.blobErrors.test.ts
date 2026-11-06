import axios from "axios";
import {http, HttpResponse} from "msw";
import {describe, expect, test} from "vitest";
import i18n from "../i18n";
import {api as apiUrl, problem, problemBody, server} from "../test";
import {api} from "./client.ts";
import {getErrorMessage, toApiError} from "./errors.ts";

// With responseType "blob" an error's body arrives as a Blob, and toApiError is synchronous: the client's interceptor
// parses a Blob whose type contains json back into an object (design § 12 "Two changes outside the feature").

/** The rejection of a real blob request answered by `response`, through the app's client and MSW. */
const failedDownload = async (response: () => Response) => {
    server.use(http.get(apiUrl("/blob-test"), response));
    try {
        await api.get("/blob-test", {responseType: "blob"});
    } catch (error) {
        return error;
    }
    throw new Error("The request did not fail");
};

describe("a blob request's error @area:errors", () => {
    test("application/problem+json: toApiError sees its status, code, errors and traceId @ATT-224", async () => {
        const error = await failedDownload(() => problem(400, "attachmentTooLarge"));
        expect(toApiError(error)).toEqual({
            status: 400,
            code: "attachmentTooLarge",
            errors: [{code: "attachmentTooLarge", description: "attachmentTooLarge (test)"}],
            traceId: "00-test-trace-01",
            clinicNames: [],
            drugCount: null,
        });
    });

    test("its translated message shows, in the UI language @ATT-224", async () => {
        const error = await failedDownload(() => problem(400, "attachmentTooLarge"));
        expect(getErrorMessage(error)).toBe("This file is larger than allowed.");
        await i18n.changeLanguage("ar");
        expect(getErrorMessage(error)).toBe("حجم هذا الملف أكبر من المسموح به.");
    });

    test("any type that contains json is read: application/json too @ATT-224", async () => {
        const error = await failedDownload(() => HttpResponse.json(problemBody(404, "notFound"), {status: 404}));
        expect(toApiError(error)).toMatchObject({status: 404, code: "notFound"});
    });

    test("a parse failure keeps the original error: the same status, the Blob, a generic message @ATT-224", async () => {
        const error = await failedDownload(() => new HttpResponse("{not json", {
            status: 400, headers: {"Content-Type": "application/problem+json"},
        }));
        expect(axios.isAxiosError(error)).toBe(true);
        expect(toApiError(error)).toMatchObject({status: 400, code: null});
        expect(axios.isAxiosError(error) && error.response?.data).toBeInstanceOf(Blob);
        expect(getErrorMessage(error)).toBe("Something went wrong. Please try again.");
    });

    test("an empty json body is a parse failure too: the status stays @ATT-224", async () => {
        const error = await failedDownload(() => new HttpResponse(null, {status: 401, headers: {"Content-Type": "application/problem+json"}}));
        expect(toApiError(error)).toMatchObject({status: 401, code: null});
    });

    test("a Blob of any other type isn't parsed: json inside text stays text @ATT-224", async () => {
        const error = await failedDownload(() => new HttpResponse(JSON.stringify(problemBody(400, "attachmentTooLarge")), {
            status: 400, headers: {"Content-Type": "text/plain"},
        }));
        expect(toApiError(error)).toMatchObject({status: 400, code: null});
        expect(axios.isAxiosError(error) && error.response?.data).toBeInstanceOf(Blob);
    });

    test("a download that succeeds stays a Blob, even of a json file @ATT-224", async () => {
        server.use(http.get(apiUrl("/blob-test"), () => HttpResponse.json({code: "just a file"})));
        const {data} = await api.get<Blob>("/blob-test", {responseType: "blob"});
        expect(data).toBeInstanceOf(Blob);
        await expect(data.text()).resolves.toBe('{"code":"just a file"}');
    });

    test("a request that isn't a blob's keeps its object body @ATT-224", async () => {
        server.use(http.get(apiUrl("/blob-test"), () => problem(400, "attachmentTooLarge")));
        const error: unknown = await api.get("/blob-test").catch((reason: unknown) => reason);
        expect(toApiError(error)).toMatchObject({status: 400, code: "attachmentTooLarge"});
    });
});
